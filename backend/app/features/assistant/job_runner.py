"""AI ジョブ（編集・要約・チャット）のディスパッチと処理エントリポイント。

責務: ジョブ種別ごとの「何を実行するか」を定義し、送り先の選択（job_queue）と
    状態機械（job_lifecycle）を繋ぐ。
主要なエクスポート: dispatch_ai_job, dispatch_edit_job, process_edit_job,
    process_summarize_job, process_chat_job, run_edit_job_from_event,
    run_edit_job_queue_records, process_edit_job_queue_records、SNSPublisher。
呼び出し関係: FastAPI ルーターおよび Lambda ハンドラから呼ばれ、
    AIInteractionUseCases を通じて AI ゲートウェイを実行する。
    ワイヤ上のペイロード（AIJob.input と SQS 通知）の型は job_payloads が所有する。
"""

import asyncio
import logging
from uuid import UUID

from fastapi import BackgroundTasks

from app.features.assistant.gateway import AIGateway
from app.features.assistant.job_lifecycle import get_session, run_job
from app.features.assistant.job_payloads import (
    ChatJobInput,
    JobEnvelope,
    SummarizeJobInput,
    decode_as,
)
from app.features.assistant.job_queue import (
    EDIT_JOB_TOPIC_ARN_ENV,
    JobHandlers,
    SNSPublisher,
    dispatch,
    select_job_queue,
)
from app.features.assistant.repositories import AIEditJobRepository, AIJobRepository
from app.features.assistant.use_cases import AIInteractionUseCases
from app.logging_utils import log_event
from app.models import AIEditJob, AIJob

__all__ = [
    "EDIT_JOB_TOPIC_ARN_ENV",
    "PROCESS_CHAT_JOB_TASK",
    "PROCESS_EDIT_JOB_TASK",
    "PROCESS_SUMMARIZE_JOB_TASK",
    "SNSPublisher",
    "dispatch_ai_job",
    "dispatch_edit_job",
    "process_chat_job",
    "process_edit_job",
    "process_edit_job_queue_records",
    "process_summarize_job",
    "run_edit_job_from_event",
    "run_edit_job_queue_records",
]

logger = logging.getLogger(__name__)

PROCESS_EDIT_JOB_TASK = "process_ai_edit_job"
PROCESS_SUMMARIZE_JOB_TASK = "process_ai_summarize_job"
PROCESS_CHAT_JOB_TASK = "process_ai_chat_job"


def _task_handlers() -> JobHandlers:
    """task 名 → 処理関数のディスパッチ表（呼び出し時に解決）。"""
    return {
        PROCESS_EDIT_JOB_TASK: process_edit_job,
        PROCESS_SUMMARIZE_JOB_TASK: process_summarize_job,
        PROCESS_CHAT_JOB_TASK: process_chat_job,
    }


async def dispatch_ai_job(
    job_id: UUID,
    user_id: str,
    task: str,
    background_tasks: BackgroundTasks | None = None,
    publisher: SNSPublisher | None = None,
) -> None:
    """AI ジョブ（編集・要約・チャット）を SNS/SQS またはローカル実行へキューイングする。

    全ジョブ種別は共有 SNS トピックを使い、task でワーカー側の処理を振り分ける。
    トピック未設定（ローカル開発）時は BackgroundTasks かインライン実行に
    フォールバックする。どれを使うかの判断は job_queue.select_job_queue が持つ。
    """
    queue = select_job_queue(
        _task_handlers(),
        background_tasks=background_tasks,
        publisher=publisher,
    )
    await dispatch(queue, JobEnvelope(task=task, job_id=str(job_id), user_id=user_id))


async def dispatch_edit_job(
    job_id: UUID,
    user_id: str,
    background_tasks: BackgroundTasks | None = None,
    publisher: SNSPublisher | None = None,
) -> None:
    """AI 編集ジョブをディスパッチする（dispatch_ai_job の編集用ラッパー）。"""
    await dispatch_ai_job(
        job_id,
        user_id,
        PROCESS_EDIT_JOB_TASK,
        background_tasks=background_tasks,
        publisher=publisher,
    )


async def process_edit_job(
    job_id: UUID | str,
    *,
    expected_user_id: str | None = None,
    session_factory=get_session,
    ai_gateway: AIGateway | None = None,
) -> None:
    """AI 編集ジョブを処理し、ポーリングクライアント向けに結果を永続化する。"""

    async def run(use_cases: AIInteractionUseCases, job: AIEditJob) -> tuple[str, int]:
        return await use_cases.execute_edit(
            content=job.content,
            instruction=job.instruction,
        )

    await run_job(
        job_id,
        AIEditJobRepository,
        run,
        PROCESS_EDIT_JOB_TASK,
        expected_user_id=expected_user_id,
        session_factory=session_factory,
        ai_gateway=ai_gateway,
    )


async def process_summarize_job(
    job_id: UUID | str,
    *,
    expected_user_id: str | None = None,
    session_factory=get_session,
    ai_gateway: AIGateway | None = None,
) -> None:
    """キュー済みの要約ジョブを処理する。"""

    async def run(use_cases: AIInteractionUseCases, job: AIJob) -> tuple[str, int]:
        job_input = decode_as(job.kind, job.input, SummarizeJobInput)
        return await use_cases.summarize_note(job_input.note_id)

    await run_job(
        job_id,
        AIJobRepository,
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
    session_factory=get_session,
    ai_gateway: AIGateway | None = None,
) -> None:
    """キュー済みのチャットジョブを処理する。"""

    async def run(use_cases: AIInteractionUseCases, job: AIJob) -> tuple[str, int]:
        job_input = decode_as(job.kind, job.input, ChatJobInput)
        return await use_cases.chat_with_context(
            scope=job_input.scope,
            question=job_input.question,
            history=job_input.history or None,
            note_id=job_input.note_id,
            folder_id=job_input.folder_id,
            selected_content=job_input.selected_content,
        )

    await run_job(
        job_id,
        AIJobRepository,
        run,
        PROCESS_CHAT_JOB_TASK,
        expected_user_id=expected_user_id,
        session_factory=session_factory,
        ai_gateway=ai_gateway,
    )


def run_edit_job_from_event(job_id: str) -> None:
    """非 HTTP 起動 (Lambda イベント等) からキュー済み AI 編集ジョブを処理する。"""
    asyncio.run(process_edit_job(job_id))


async def process_edit_job_queue_records(
    records: list[dict],
    *,
    handlers: JobHandlers | None = None,
) -> dict[str, list[dict[str, str]]]:
    """SQS レコード群を task で振り分けて処理し、失敗アイテムのみ再試行対象として返す。

    編集・要約・チャットの全ジョブ種別を同一キュー/ワーカーで処理する。
    """
    handlers = handlers or _task_handlers()
    failures: list[dict[str, str]] = []

    for record in records:
        message_id = record.get("messageId", "unknown")
        try:
            envelope = JobEnvelope.from_sqs_record(record)
            process_job_fn = handlers.get(envelope.task)
            if process_job_fn is None:
                raise ValueError(f"Unsupported queue task: {envelope.task}")

            await process_job_fn(envelope.job_id, expected_user_id=envelope.user_id)
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
