"""Lambda handler for FastAPI application using Mangum."""

import logging

from mangum import Mangum

from app.database import create_db_and_tables
from app.main import app
from app.services.edit_jobs import run_edit_job_queue_records

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Run migrations on Lambda cold start
logger.info("Lambda cold start: initializing database schema...")
try:
    create_db_and_tables()
    logger.info("Lambda cold start: database schema initialization complete")
except Exception as e:
    logger.error(
        f"Lambda cold start: database schema initialization failed: {e}",
        exc_info=True,
    )
    # Re-raise to ensure Lambda reports the error
    raise

# Create Lambda handler
asgi_handler = Mangum(
    app,
    lifespan="off",
    api_gateway_base_path="/",
)


def handler(event, context):
    """Dispatch API Gateway requests and SQS-driven edit job events."""
    if isinstance(event, dict) and event.get("Records"):
        first_record = event["Records"][0]
        if first_record.get("eventSource") == "aws:sqs":
            return run_edit_job_queue_records(event["Records"])

    return asgi_handler(event, context)
