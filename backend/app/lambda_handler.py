"""Lambda handler for FastAPI application using Mangum."""

import logging

from mangum import Mangum

from app.database import create_db_and_tables
from app.main import app

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
    """Handle API Gateway requests."""
    return asgi_handler(event, context)
