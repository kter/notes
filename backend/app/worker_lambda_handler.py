"""Lambda handler for SQS-driven AI edit jobs."""

import logging

from app.bootstrap import run_cold_start_database_bootstrap
from app.database import create_db_and_tables
from app.features.assistant import run_edit_job_queue_records
from app.logging_utils import bind_log_context, configure_logging, reset_log_context
from app.observability import init_sentry

configure_logging()
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

init_sentry()

run_cold_start_database_bootstrap(
    initialize_database=create_db_and_tables,
    logger=logger,
    context_label="AI edit worker cold start",
)


def handler(event, context):
    """Handle SQS events for queued AI edit jobs."""
    context_tokens = bind_log_context(
        request_id=getattr(context, "aws_request_id", None),
    )
    try:
        if not isinstance(event, dict) or not event.get("Records"):
            raise ValueError("AI edit worker expects SQS records")

        first_record = event["Records"][0]
        if first_record.get("eventSource") != "aws:sqs":
            raise ValueError("AI edit worker only supports SQS events")

        return run_edit_job_queue_records(event["Records"])
    finally:
        reset_log_context(context_tokens)
