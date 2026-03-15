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
from app.features.assistant.service import (
    AI_EDIT_JOB_TIMEOUT_MESSAGE,
    AIApplicationService,
    AIApplicationTimeoutError,
    AITokenLimitExceededError,
)
from app.models import AIEditJob
from app.services import AIService, get_ai_service

logger = logging.getLogger(__name__)

PROCESS_EDIT_JOB_TASK = "process_ai_edit_job"
EDIT_JOB_TOPIC_ARN_ENV = "AI_EDIT_JOB_TOPIC_ARN"


def _get_session() -> Session:
    return Session(get_dsql_engine())


async def dispatch_edit_job(
    job_id: UUID, background_tasks: BackgroundTasks | None = None
) -> None:
    """Queue AI edit job processing via SNS/SQS or local background execution."""
    topic_arn = os.getenv(EDIT_JOB_TOPIC_ARN_ENV)

    if topic_arn:
        boto3.client("sns").publish(
            TopicArn=topic_arn,
            Message=json.dumps({"task": PROCESS_EDIT_JOB_TASK, "job_id": str(job_id)}),
        )
        return

    if background_tasks is not None:
        background_tasks.add_task(process_edit_job, job_id)
        return

    await process_edit_job(job_id)


async def process_edit_job(
    job_id: UUID | str,
    *,
    session_factory=_get_session,
    ai_service: AIService | None = None,
) -> None:
    """Process an AI edit job and persist the result for polling clients."""
    ai_service = ai_service or get_ai_service()

    with session_factory() as session:
        job = session.get(AIEditJob, job_id)
        if job is None:
            logger.warning("AI edit job %s not found", job_id)
            return

        if job.status in {"running", "completed"}:
            return

        job.status = "running"
        job.started_at = datetime.now(UTC)
        job.updated_at = job.started_at
        session.add(job)
        session.commit()

        try:
            application_service = AIApplicationService(
                session=session,
                user_id=job.user_id,
                ai_service=ai_service,
            )
            edited_content, tokens_used = await application_service.execute_edit(
                content=job.content,
                instruction=job.instruction,
            )

            job.status = "completed"
            job.edited_content = edited_content
            job.tokens_used = tokens_used
            job.error_message = None
        except AIApplicationTimeoutError:
            job.status = "failed"
            job.error_message = AI_EDIT_JOB_TIMEOUT_MESSAGE
        except AITokenLimitExceededError as exc:
            job.status = "failed"
            job.error_message = str(exc)
        except Exception as exc:
            logger.exception("AI edit job %s failed", job_id)
            job.status = "failed"
            job.error_message = str(exc)
        finally:
            now = datetime.now(UTC)
            job.completed_at = now if job.status in {"completed", "failed"} else None
            job.updated_at = now
            session.add(job)
            session.commit()


def run_edit_job_from_event(job_id: str) -> None:
    """Process a queued AI edit job from a non-HTTP invocation."""
    asyncio.run(process_edit_job(job_id))


def _extract_job_payload(record: dict) -> dict:
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
    """Process SQS records and report only failed items for retry."""
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
            logger.exception(
                "Failed to process AI edit job queue record %s", message_id
            )
            failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": failures}


def run_edit_job_queue_records(records: list[dict]) -> dict[str, list[dict[str, str]]]:
    """Synchronous wrapper for Lambda SQS event handling."""
    return asyncio.run(process_edit_job_queue_records(records))
