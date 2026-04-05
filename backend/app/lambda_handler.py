"""Lambda handler for FastAPI application using Mangum."""

import logging

from mangum import Mangum

from app.bootstrap import run_cold_start_database_bootstrap
from app.database import create_db_and_tables
from app.logging_utils import configure_logging
from app.main import app

# Configure logging
configure_logging()
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

run_cold_start_database_bootstrap(
    initialize_database=create_db_and_tables,
    logger=logger,
    context_label="Lambda cold start",
)

# Create Lambda handler
asgi_handler = Mangum(
    app,
    lifespan="off",
    api_gateway_base_path="/",
)


def handler(event, context):
    """Handle API Gateway requests."""
    return asgi_handler(event, context)
