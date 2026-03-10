"""Lambda handler for SQS-driven AI edit jobs."""

import logging

from app.database import create_db_and_tables
from app.services.edit_jobs import run_edit_job_queue_records

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

logger.info("AI edit worker cold start: initializing database schema...")
try:
    create_db_and_tables()
    logger.info("AI edit worker cold start: database schema initialization complete")
except Exception as e:
    logger.error(
        f"AI edit worker cold start: database schema initialization failed: {e}",
        exc_info=True,
    )
    raise


def handler(event, context):
    """Handle SQS events for queued AI edit jobs."""
    if not isinstance(event, dict) or not event.get("Records"):
        raise ValueError("AI edit worker expects SQS records")

    first_record = event["Records"][0]
    if first_record.get("eventSource") != "aws:sqs":
        raise ValueError("AI edit worker only supports SQS events")

    return run_edit_job_queue_records(event["Records"])
