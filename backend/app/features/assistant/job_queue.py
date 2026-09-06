"""AI ジョブをワーカーへ届ける経路（トランスポート）。

責務: ジョブ通知をどこへ送るか — SNS トピック、FastAPI の BackgroundTasks、
    その場での実行 — の選択と送信のみを担う。ジョブの状態遷移や結果の永続化は
    job_lifecycle が担当する。
主要なエクスポート: JobQueue, SNSQueue, BackgroundTaskQueue, InlineQueue,
    select_job_queue, EDIT_JOB_TOPIC_ARN_ENV。
呼び出し関係: job_runner.dispatch_ai_job から使われ、JobEnvelope を送る。

送り先が 3 つ実在する（本番の SNS、ローカル開発の BackgroundTasks、
それも無い環境でのインライン実行）ため、ここはシームとして切り出してある。
"""

import logging
import os
from collections.abc import Awaitable, Callable
from typing import Protocol

import boto3
from fastapi import BackgroundTasks

from app.features.assistant.job_payloads import JobEnvelope
from app.logging_utils import log_event

logger = logging.getLogger(__name__)

# 全ジョブ種別が共有する SNS トピック（編集ジョブ用に作成済みのものを再利用）
EDIT_JOB_TOPIC_ARN_ENV = "AI_EDIT_JOB_TOPIC_ARN"

# task 名 → ジョブ処理関数のディスパッチ表。
# ローカル実行系のキューは、SNS を経由せずこの表から直接ハンドラーを引く。
JobHandlers = dict[str, Callable[..., Awaitable[None]]]


class SNSPublisher(Protocol):
    """AIジョブの通知に利用するSNS発行操作のインターフェース。"""

    def publish(self, *, TopicArn: str, Message: str) -> object: ...


class JobQueue(Protocol):
    """ジョブ通知の送り先。"""

    # 監査ログに残す送り先の名前
    dispatch_mode: str
    # enqueue がその場でジョブを走らせ切るなら True。
    # ログを出す順序と outcome の両方がこれで決まる。
    runs_synchronously: bool

    async def enqueue(self, envelope: JobEnvelope) -> None:
        """ジョブ通知を送る。"""
        ...


class SNSQueue:
    """本番経路。共有 SNS トピックへ publish し、SQS 経由でワーカーが受け取る。"""

    dispatch_mode = "sns"
    runs_synchronously = False

    def __init__(self, topic_arn: str, publisher: SNSPublisher | None = None):
        self.topic_arn = topic_arn
        # 遅延解決: ローカル開発で SNS クライアントを作らせない。
        self._publisher = publisher

    async def enqueue(self, envelope: JobEnvelope) -> None:
        publisher = self._publisher or boto3.client("sns")
        publisher.publish(TopicArn=self.topic_arn, Message=envelope.to_message())


class BackgroundTaskQueue:
    """ローカル開発経路。FastAPI のレスポンス返却後に同一プロセスで実行する。"""

    dispatch_mode = "background_tasks"
    runs_synchronously = False

    def __init__(self, background_tasks: BackgroundTasks, handlers: JobHandlers):
        self.background_tasks = background_tasks
        self.handlers = handlers

    async def enqueue(self, envelope: JobEnvelope) -> None:
        handler = _handler_for(self.handlers, envelope.task)
        self.background_tasks.add_task(
            handler, envelope.job_id, expected_user_id=envelope.user_id
        )


class InlineQueue:
    """その場で実行する経路。キューもバックグラウンドも無い環境向け。

    テストはこれを直接組み立てられるため、トピック ARN の環境変数を
    monkeypatch する必要がない。
    """

    dispatch_mode = "inline"
    runs_synchronously = True

    def __init__(self, handlers: JobHandlers):
        self.handlers = handlers

    async def enqueue(self, envelope: JobEnvelope) -> None:
        handler = _handler_for(self.handlers, envelope.task)
        await handler(envelope.job_id, expected_user_id=envelope.user_id)


def select_job_queue(
    handlers: JobHandlers,
    *,
    background_tasks: BackgroundTasks | None = None,
    publisher: SNSPublisher | None = None,
) -> JobQueue:
    """実行環境に応じた送り先を 1 箇所で選ぶ。

    トピック ARN が設定されていれば SNS、なければ BackgroundTasks、
    それも無ければインライン実行にフォールバックする。
    環境変数を読むのはこの関数だけ。
    """
    topic_arn = os.getenv(EDIT_JOB_TOPIC_ARN_ENV)
    if topic_arn:
        return SNSQueue(topic_arn, publisher)
    if background_tasks is not None:
        return BackgroundTaskQueue(background_tasks, handlers)
    return InlineQueue(handlers)


async def dispatch(queue: JobQueue, envelope: JobEnvelope) -> None:
    """通知を送り、送り先の種別を含めて監査ログに残す。

    インライン実行は enqueue がジョブ本体を走らせ切ってしまうため、ログは先に出す。
    そうしないとジョブ自身の started / completed より後ろにずれ、
    ハンドラーが例外を投げた場合は 1 行も残らない。
    非同期の送り先は逆に、送信が成功してからでないと queued とは言えない。
    """
    if queue.runs_synchronously:
        _log_dispatched(queue, envelope)
        await queue.enqueue(envelope)
        return

    await queue.enqueue(envelope)
    _log_dispatched(queue, envelope)


def _log_dispatched(queue: JobQueue, envelope: JobEnvelope) -> None:
    """ディスパッチを監査ログに記録する。"""
    log_event(
        logger,
        logging.INFO,
        "ops.ai_job.dispatched",
        job_id=envelope.job_id,
        task=envelope.task,
        dispatch_mode=queue.dispatch_mode,
        outcome="running" if queue.runs_synchronously else "queued",
    )


def _handler_for(handlers: JobHandlers, task: str) -> Callable[..., Awaitable[None]]:
    """task 名に対応するハンドラーを返す。未知の task は ValueError。"""
    handler = handlers.get(task)
    if handler is None:
        raise ValueError(f"Unsupported queue task: {task}")
    return handler
