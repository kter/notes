"""Lambda handler for MCP Server using Mangum."""

import logging
from mangum import Mangum
from app import app

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create Lambda handler - this matches the CMD in Dockerfile
handler = Mangum(
    app,
    lifespan="off",
    api_gateway_base_path="/",
)
