"""AI ジョブ（編集・要約・チャット）のディスパッチと処理ランナー。

責務: AI ジョブを SNS/SQS またはローカルバックグラウンドタスクで実行し、
    結果をデータベースに永続化する。状態機械は _run_ai_job に一本化され、
    レコード種別ごとの差分は AIJobRecordSpec が保持する。
主要なエクスポート: dispatch_ai_job, dispatch_edit_job, process_edit_job,
    process_summarize_job, process_chat_job, run_edit_job_from_event,
    run_edit_job_queue_records, process_edit_job_queue_records
呼び出し関係: FastAPI ルーターおよび Lambda ハンドラから呼ばれ、
    AIInteractionUseCases を通じて AI ゲートウェイを実行する。
"""

import asyncio
import json
import logging
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import boto3
from fastapi import BackgroundTasks
from sqlmodel import Session

from app.database import get_dsql_engine
from app.features.assistant.errors import (
    AI_EDIT_JOB_TIMEOUT_MESSAGE,
    AIApplicationTimeoutError,
    AITokenLimitExceededError,
)
from app.features.assistant.gateway import AIGateway, get_ai_gateway
from app.features.assistant.repositories import AIEditJobRepository, AIJobRepository
from app.features.assistant.schemas import BedrockMessage
from app.features.assistant.use_cases import AIInteractionUseCases
from app.features.workspace.use_cases import WorkspaceQueryUseCases
from app.logging_utils import log_event
from app.models import AIEditJob, AIJob
from app.models.enums import ChatScope
from app.shared import NotFound

logger = logging.getLogger(__name__)

PROCESS_EDIT_JOB_TASK = "process_ai_edit_job"
PROCESS_SUMMARIZE_JOB_TASK = "process_ai_summarize_job"
PROCESS_CHAT_JOB_TASK = "process_ai_chat_job"
# 全ジョブ種別が共有する SNS トピック（編集ジョブ用に作成済みのものを再利用）
EDIT_JOB_TOPIC_ARN_ENV = "AI_EDIT_JOB_TOPIC_ARN"


@dataclass(frozen=True)
class AIJobRecordSpec:
    """ジョブレコードの種類ごとに異なる永続化・ログ出力方法を表す記述子。

    app.models の AIJobKind（"summarize" | "chat"）とは別概念であることに注意。
    こちらはどのテーブルの行を扱うかを表す。
    """

    model: type
    repository_cls: type
    event_prefix: str
    extra_log_fields: Callable[[Any], dict[str, Any]]
    apply_result: Callable[[Any, str], None]


def _edit_job_log_fields(job: Any) -> dict[str, Any]:
    """AI 編集ジョブの追加ログフィールドを返す。編集ジョブには kind が無いため空。"""
    return {}


def _ai_job_log_fields(job: AIJob) -> dict[str, Any]:
    """汎用 AI ジョブの種別ログフィールドを返す。"""
    return {"kind": job.kind}


def _apply_edit_result(job: AIEditJob, result: str) -> None:
    """AI 編集ジョブへ編集結果を設定する。"""
    job.edited_content = result


def _apply_ai_job_result(job: AIJob, result: str) -> None:
    """汎用 AI ジョブへ実行結果を設定する。"""
    job.result = result


AI_EDIT_JOB_SPEC = AIJobRecordSpec(
    model=AIEditJob,
    repository_cls=AIEditJobRepository,
    event_prefix="ops.ai_edit_job",
    extra_log_fields=_edit_job_log_fields,
    apply_result=_apply_edit_result,
)
AI_JOB_SPEC = AIJobRecordSpec(
    model=AIJob,
    repository_cls=AIJobRepository,
    event_prefix="ops.ai_job",
    extra_log_fields=_ai_job_log_fields,
    apply_result=_apply_ai_job_result,
)


def _get_session() -> Session:
    """DSQL エンジンから新しいデータベースセッションを生成して返す。"""
    return Session(get_dsql_engine())


def _task_handlers() -> dict:
    """task 名 → 処理関数のディスパッチ表（呼び出し時に解決）。"""
    return {
        PROCESS_EDIT_JOB_TASK: process_edit_job,
        PROCESS_SUMMARIZE_JOB_TASK: process_summarize_job,
        PROCESS_CHAT_JOB_TASK: process_chat_job,
    }


def _assert_job_owner(
    session: Session,
    job,
    *,
    expected_user_id: str | None,
    repository_cls,
    task: str,
):
    """キューメッセージが主張する所有者と行の所有者が一致することを確認する。

    一致すればリポジトリ経由で取得し直した行を返す。一致しなければ None を返し、
    呼び出し元はジョブを処理してはならない。expected_user_id が None の場合は
    主張自体が無いため、警告を残したうえで従来どおり処理を継続する（デプロイ時に
    キューへ滞留している旧形式メッセージのための移行措置）。
    """
    if expected_user_id is None:
        log_event(
            logger,
            logging.WARNING,
            "ops.ai_job.owner_assertion_missing",
            job_id=job.id,
            task=task,
            outcome="warning",
            reason="missing_expected_user_id",
        )
        return job

    try:
        return repository_cls(session, expected_user_id).get_owned(job.id)
    except NotFound:
        log_event(
            logger,
            logging.ERROR,
            "ops.ai_job.owner_mismatch",
            job_id=job.id,
            task=task,
            outcome="error",
        )
        return None


async def dispatch_ai_job(
    job_id: UUID,
    user_id: str,
    task: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """AI ジョブ（編集・要約・チャット）を SNS/SQS またはローカル実行へキューイングする。

    全ジョブ種別は共有 SNS トピックを使い、task でワーカー側の処理を振り分ける。
    トピック未設定（ローカル開発）時は BackgroundTasks かインライン実行にフォールバックする。
    """
    topic_arn = os.getenv(EDIT_JOB_TOPIC_ARN_ENV)

    if topic_arn:
        boto3.client("sns").publish(
            TopicArn=topic_arn,
            Message=json.dumps(
                {"task": task, "job_id": str(job_id), "user_id": user_id}
            ),
        )
        log_event(
            logger,
            logging.INFO,
            "ops.ai_job.dispatched",
            job_id=job_id,
            task=task,
            dispatch_mode="sns",
            outcome="queued",
        )
        return

    process_fn = _task_handlers()[task]

    if background_tasks is not None:
        background_tasks.add_task(process_fn, job_id, expected_user_id=user_id)
        log_event(
            logger,
            logging.INFO,
            "ops.ai_job.dispatched",
            job_id=job_id,
            task=task,
            dispatch_mode="background_tasks",
            outcome="queued",
        )
        return

    log_event(
        logger,
        logging.INFO,
        "ops.ai_job.dispatched",
        job_id=job_id,
        task=task,
        dispatch_mode="inline",
        outcome="running",
    )
    await process_fn(job_id, expected_user_id=user_id)


async def dispatch_edit_job(
    job_id: UUID,
    user_id: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """AI 編集ジョブをディスパッチする（dispatch_ai_job の編集用ラッパー）。"""
    await dispatch_ai_job(
        job_id, user_id, PROCESS_EDIT_JOB_TASK, background_tasks=background_tasks
    )


async def process_edit_job(
    job_id: UUID | str,
    *,
    expected_user_id: str | None = None,
    session_factory=_get_session,
    ai_gateway: AIGateway | None = None,
) -> None:
    """AI 編集ジョブを処理し、ポーリングクライアント向けに結果を永続化する。"""

    async def run(use_cases: AIInteractionUseCases, job: AIEditJob) -> tuple[str, int]:
        return await use_cases.execute_edit(
            content=job.content,
            instruction=job.instruction,
        )

    await _run_ai_job(
        job_id,
        AI_EDIT_JOB_SPEC,
        run,
        PROCESS_EDIT_JOB_TASK,
        expected_user_id=expected_user_id,
        session_factory=session_factory,
        ai_gateway=ai_gateway,
    )


async def _run_ai_job(
    job_id: UUID | str,
    kind: AIJobRecordSpec,
    run_call: Callable[[AIInteractionUseCases, Any], Awaitable[tuple[str, int]]],
    task: str,
    *,
    expected_user_id: str | None = None,
    session_factory=_get_session,
    ai_gateway: AIGateway | None = None,
) -> None:
    """AI ジョブを処理し結果を永続化する共通状態機械。

    run_call(use_cases, job) は (結果テキスト, 消費トークン数) を返す async 呼び出し。
    トークン計上は AIInteractionUseCases 内で行われる。
    """
    resource_id = UUID(job_id) if isinstance(job_id, str) else job_id
    with session_factory() as session:
        job = session.get(kind.model, resource_id)
        if job is None:
            log_event(
                logger,
                logging.WARNING,
                f"{kind.event_prefix}.not_found",
                job_id=job_id,
                outcome="failure",
            )
            return

        job = _assert_job_owner(
            session,
            job,
            expected_user_id=expected_user_id,
            repository_cls=kind.repository_cls,
            task=task,
        )
        if job is None:
            return

        # 二重実行を防ぐ冪等ガード
        if job.status in {"running", "completed"}:
            return

        ai_gateway = ai_gateway or get_ai_gateway()

        job.status = "running"
        job.started_at = datetime.now(UTC)
        job.updated_at = job.started_at
        session.add(job)
        session.commit()
        log_event(
            logger,
            logging.INFO,
            f"{kind.event_prefix}.started",
            job_id=job.id,
            **kind.extra_log_fields(job),
            outcome="running",
        )

        try:
            workspace_queries = WorkspaceQueryUseCases(session, job.user_id)
            interaction_use_cases = AIInteractionUseCases(
                session=session,
                user_id=job.user_id,
                ai_gateway=ai_gateway,
                workspace_queries=workspace_queries,
            )
            result, tokens_used = await run_call(interaction_use_cases, job)

            job.status = "completed"
            kind.apply_result(job, result)
            job.tokens_used = tokens_used
            job.error_message = None
            log_event(
                logger,
                logging.INFO,
                f"{kind.event_prefix}.completed",
                job_id=job.id,
                **kind.extra_log_fields(job),
                tokens_used=tokens_used,
                outcome="success",
            )
        except AIApplicationTimeoutError:
            job.status = "failed"
            job.error_message = AI_EDIT_JOB_TIMEOUT_MESSAGE
            log_event(
                logger,
                logging.ERROR,
                f"{kind.event_prefix}.failed",
                job_id=job.id,
                **kind.extra_log_fields(job),
                outcome="timeout",
                reason="ai_timeout",
            )
        except AITokenLimitExceededError as exc:
            job.status = "failed"
            job.error_message = str(exc)
            log_event(
                logger,
                logging.WARNING,
                f"{kind.event_prefix}.failed",
                job_id=job.id,
                **kind.extra_log_fields(job),
                outcome="failure",
                reason="token_limit_exceeded",
            )
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                f"{kind.event_prefix}.failed",
                job_id=job_id,
                outcome="error",
                reason=exc.__class__.__name__,
                exc_info=True,
            )
            job.status = "failed"
            job.error_message = str(exc)
        finally:
            now = datetime.now(UTC)
            job.completed_at = now if job.status in {"completed", "failed"} else None
            job.updated_at = now
            session.add(job)
            session.commit()


async def process_summarize_job(
    job_id: UUID | str,
    *,
    expected_user_id: str | None = None,
    session_factory=_get_session,
    ai_gateway: AIGateway | None = None,
) -> None:
    """キュー済みの要約ジョブを処理する。"""

    async def run(use_cases: AIInteractionUseCases, job: AIJob) -> tuple[str, int]:
        params = json.loads(job.input)
        return await use_cases.summarize_note(UUID(params["note_id"]))

    await _run_ai_job(
        job_id,
        AI_JOB_SPEC,
        run,
        PROCESS_SUMMARIZE_JOB_TASK,
        expected_user_id=expected_user_id,
        session_factory=session_factory,
        ai_gateway=ai_gateway,
    )


async def process_chat_job(
    job_id: UUID | str,
    *,
    expected_user_id: str | None = None,
    session_factory=_get_session,
    ai_gateway: AIGateway | None = None,
) -> None:
    """キュー済みのチャットジョブを処理する。"""

    async def run(use_cases: AIInteractionUseCases, job: AIJob) -> tuple[str, int]:
        params = json.loads(job.input)
        raw_history = params.get("history") or []
        # gateway.chat は各メッセージで .model_dump() を呼ぶため BedrockMessage に復元する
        history = [BedrockMessage(**msg) for msg in raw_history] or None
        return await use_cases.chat_with_context(
            scope=ChatScope(params["scope"]),
            question=params["question"],
            history=history,
            note_id=UUID(params["note_id"]) if params.get("note_id") else None,
            folder_id=UUID(params["folder_id"]) if params.get("folder_id") else None,
            selected_content=params.get("selected_content"),
        )

    await _run_ai_job(
        job_id,
        AI_JOB_SPEC,
        run,
        PROCESS_CHAT_JOB_TASK,
        expected_user_id=expected_user_id,
        session_factory=session_factory,
        ai_gateway=ai_gateway,
    )


def run_edit_job_from_event(job_id: str) -> None:
    """非 HTTP 起動 (Lambda イベント等) からキュー済み AI 編集ジョブを処理する。"""
    asyncio.run(process_edit_job(job_id))


def _extract_job_payload(record: dict) -> dict:
    """SQS レコードから SNS ラップを展開してジョブペイロードを返す。"""
    body = record.get("body", "")
    payload = json.loads(body)

    if payload.get("Type") == "Notification" and "Message" in payload:
        payload = json.loads(payload["Message"])

    return payload


async def process_edit_job_queue_records(
    records: list[dict],
    *,
    handlers: dict | None = None,
) -> dict[str, list[dict[str, str]]]:
    """SQS レコード群を task で振り分けて処理し、失敗アイテムのみ再試行対象として返す。

    編集・要約・チャットの全ジョブ種別を同一キュー/ワーカーで処理する。
    """
    handlers = handlers or _task_handlers()
    failures: list[dict[str, str]] = []

    for record in records:
        message_id = record.get("messageId", "unknown")
        try:
            payload = _extract_job_payload(record)
            task = payload.get("task")
            process_job_fn = handlers.get(task)
            if process_job_fn is None:
                raise ValueError(f"Unsupported queue task: {task}")

            job_id = payload.get("job_id")
            if not job_id:
                raise ValueError("Queue message is missing job_id")

            await process_job_fn(job_id, expected_user_id=payload.get("user_id"))
        except Exception:
            log_event(
                logger,
                logging.ERROR,
                "ops.ai_job.queue_record_failed",
                queue_message_id=message_id,
                outcome="error",
                exc_info=True,
            )
            failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": failures}


def run_edit_job_queue_records(records: list[dict]) -> dict[str, list[dict[str, str]]]:
    """Lambda SQS イベントハンドリング用の同期ラッパー（全ジョブ種別を処理）。"""
    return asyncio.run(process_edit_job_queue_records(records))
