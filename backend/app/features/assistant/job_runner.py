"""AI 編集ジョブのディスパッチと処理ランナー。

責務: AI 編集ジョブを SNS/SQS またはローカルバックグラウンドタスクで
    実行し、結果をデータベースに永続化する。
主要なエクスポート: dispatch_edit_job, process_edit_job,
    run_edit_job_from_event, run_edit_job_queue_records,
    process_edit_job_queue_records
呼び出し関係: FastAPI ルーターおよび Lambda ハンドラから呼ばれ、
    AIInteractionUseCases を通じて AI ゲートウェイを実行する。
"""

import asyncio
import json
import logging
import os
from datetime import UTC, datetime
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
from app.features.assistant.use_cases import AIInteractionUseCases
from app.features.workspace.use_cases import WorkspaceQueryUseCases
from app.logging_utils import log_event
from app.models import AIEditJob

logger = logging.getLogger(__name__)

PROCESS_EDIT_JOB_TASK = "process_ai_edit_job"
EDIT_JOB_TOPIC_ARN_ENV = "AI_EDIT_JOB_TOPIC_ARN"


def _get_session() -> Session:
    """DSQL エンジンから新しいデータベースセッションを生成して返す。"""
    return Session(get_dsql_engine())


async def dispatch_edit_job(
    job_id: UUID, background_tasks: BackgroundTasks | None = None
) -> None:
    """AI 編集ジョブを SNS/SQS またはローカルバックグラウンドタスクへキューイングする。"""
    topic_arn = os.getenv(EDIT_JOB_TOPIC_ARN_ENV)

    if topic_arn:
        boto3.client("sns").publish(
            TopicArn=topic_arn,
            Message=json.dumps({"task": PROCESS_EDIT_JOB_TASK, "job_id": str(job_id)}),
        )
        log_event(
            logger,
            logging.INFO,
            "ops.ai_edit_job.dispatched",
            job_id=job_id,
            dispatch_mode="sns",
            outcome="queued",
        )
        return

    if background_tasks is not None:
        background_tasks.add_task(process_edit_job, job_id)
        log_event(
            logger,
            logging.INFO,
            "ops.ai_edit_job.dispatched",
            job_id=job_id,
            dispatch_mode="background_tasks",
            outcome="queued",
        )
        return

    log_event(
        logger,
        logging.INFO,
        "ops.ai_edit_job.dispatched",
        job_id=job_id,
        dispatch_mode="inline",
        outcome="running",
    )
    await process_edit_job(job_id)


async def process_edit_job(
    job_id: UUID | str,
    *,
    session_factory=_get_session,
    ai_gateway: AIGateway | None = None,
) -> None:
    """AI 編集ジョブを処理し、ポーリングクライアント向けに結果を永続化する。"""
    ai_gateway = ai_gateway or get_ai_gateway()

    with session_factory() as session:
        job = session.get(AIEditJob, job_id)
        if job is None:
            log_event(
                logger,
                logging.WARNING,
                "ops.ai_edit_job.not_found",
                job_id=job_id,
                outcome="failure",
            )
            return

        # 二重実行を防ぐ冪等ガード
        if job.status in {"running", "completed"}:
            return

        job.status = "running"
        job.started_at = datetime.now(UTC)
        job.updated_at = job.started_at
        session.add(job)
        session.commit()
        log_event(
            logger,
            logging.INFO,
            "ops.ai_edit_job.started",
            job_id=job.id,
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
            edited_content, tokens_used = await interaction_use_cases.execute_edit(
                content=job.content,
                instruction=job.instruction,
            )

            job.status = "completed"
            job.edited_content = edited_content
            job.tokens_used = tokens_used
            job.error_message = None
            log_event(
                logger,
                logging.INFO,
                "ops.ai_edit_job.completed",
                job_id=job.id,
                tokens_used=tokens_used,
                outcome="success",
            )
        except AIApplicationTimeoutError:
            job.status = "failed"
            job.error_message = AI_EDIT_JOB_TIMEOUT_MESSAGE
            log_event(
                logger,
                logging.ERROR,
                "ops.ai_edit_job.failed",
                job_id=job.id,
                outcome="timeout",
                reason="ai_timeout",
            )
        except AITokenLimitExceededError as exc:
            job.status = "failed"
            job.error_message = str(exc)
            log_event(
                logger,
                logging.WARNING,
                "ops.ai_edit_job.failed",
                job_id=job.id,
                outcome="failure",
                reason="token_limit_exceeded",
            )
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                "ops.ai_edit_job.failed",
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
    process_job_fn=process_edit_job,
) -> dict[str, list[dict[str, str]]]:
    """SQS レコード群を処理し、失敗したアイテムのみ再試行対象として返す。"""
    failures: list[dict[str, str]] = []

    for record in records:
        message_id = record.get("messageId", "unknown")
        try:
            payload = _extract_job_payload(record)
            if payload.get("task") != PROCESS_EDIT_JOB_TASK:
                raise ValueError("Unsupported queue task")

            job_id = payload.get("job_id")
            if not job_id:
                raise ValueError("Queue message is missing job_id")

            await process_job_fn(job_id)
        except Exception:
            log_event(
                logger,
                logging.ERROR,
                "ops.ai_edit_job.queue_record_failed",
                queue_message_id=message_id,
                outcome="error",
                exc_info=True,
            )
            failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": failures}


def run_edit_job_queue_records(records: list[dict]) -> dict[str, list[dict[str, str]]]:
    """Lambda SQS イベントハンドリング用の同期ラッパー。"""
    return asyncio.run(process_edit_job_queue_records(records))
