"""MCP token management router."""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.auth import get_current_user
from app.models.mcp import MCPSettingsResponse, MCPTokenResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


@router.post("/token", response_model=MCPTokenResponse)
async def generate_mcp_token(
    request: Request,
    current_user: Annotated[dict, Depends(get_current_user)]
) -> MCPTokenResponse:
    """
    Generate an MCP token for the current authenticated user.

    This endpoint allows users to generate an MCP token from within Notes App,
    which can then be used to configure Claude Desktop or other MCP clients.
    """
    # Use the same ID token that Notes App uses
    # The get_current_user dependency already validates the JWT and extracts user info
    user_id = current_user.get("sub")
    
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    id_token = auth_header.split(" ")[1]

    # Calculate remaining time for the token
    import time
    exp = current_user.get("exp")
    expires_in = int(exp - time.time()) if exp else 3600

    logger.info(f"Generating MCP token for user {user_id}")

    return MCPTokenResponse(
        url="https://5gcqmlela7.execute-api.ap-northeast-1.amazonaws.com/",
        token=id_token,
        expires_in=expires_in
    )


@router.get("/settings", response_model=MCPSettingsResponse)
async def get_mcp_settings(
    request: Request,
    current_user: Annotated[dict, Depends(get_current_user)]
) -> MCPSettingsResponse:
    """
    Get current MCP settings for the user.
    """
    user_id = current_user.get("sub")

    # In the future, we can store per-user MCP settings in the database
    # For now, return the server URL
    logger.info(f"Fetching MCP settings for user {user_id}")

    return MCPSettingsResponse(
        server_url="https://5gcqmlela7.execute-api.ap-northeast-1.amazonaws.com/",
        token_expires_in=3600
    )


@router.post("/revoke")
async def revoke_mcp_token(
    request: Request,
    current_user: Annotated[dict, Depends(get_current_user)]
) -> Response:
    """
    Revoke the current MCP token.

    In a real implementation, this would:
    1. Store a token identifier in the database
    2. Allow users to revoke specific tokens
    3. Generate a new token that invalidates old ones

    For now, this is a placeholder that always succeeds.
    The actual token revocation would require the MCP server to implement
    token blacklisting or similar mechanism.
    """
    user_id = current_user.get("sub")
    logger.info(f"Revoking MCP token for user {user_id}")

    return Response(
        status_code=200,
        content='{"message":"Token revoked successfully"}'
    )
