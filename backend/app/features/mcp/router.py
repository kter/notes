import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlmodel import Session

from app.auth import get_current_user
from app.database import get_session
from app.features.mcp.service import MCPService
from app.models.mcp import (
    MCPSettingsResponse,
    MCPTokenCreateRequest,
    MCPTokenResponse,
    MCPTokensListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


@router.post("/tokens", response_model=MCPTokenResponse)
async def generate_mcp_token(
    request: MCPTokenCreateRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> MCPTokenResponse:
    """
    Generate a new MCP API key for current user.
    Maximum 2 active tokens per user.
    """
    service = MCPService(session, current_user.get("sub"))
    return service.generate_token(request)


@router.get("/tokens", response_model=MCPTokensListResponse)
async def list_mcp_tokens(
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> MCPTokensListResponse:
    """
    List all MCP API keys for the current user.
    Does not return the actual token value.
    """
    service = MCPService(session, current_user.get("sub"))
    return service.list_tokens()


@router.post("/tokens/{token_id}/revoke")
async def revoke_mcp_token(
    token_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> Response:
    """
    Revoke (deactivate) a specific MCP API key.
    """
    service = MCPService(session, current_user.get("sub"))
    return service.revoke_token(token_id)


@router.post("/tokens/{token_id}/restore")
async def restore_mcp_token(
    token_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> Response:
    """
    Restore (reactivate) a revoked MCP API key.
    """
    service = MCPService(session, current_user.get("sub"))
    return service.restore_token(token_id)


@router.delete("/tokens/{token_id}")
async def delete_mcp_token(
    token_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> Response:
    """
    Delete a specific MCP API key permanently.
    """
    service = MCPService(session, current_user.get("sub"))
    return service.delete_token(token_id)


@router.get("/settings", response_model=MCPSettingsResponse)
async def get_mcp_settings(
    request: Request, current_user: Annotated[dict, Depends(get_current_user)]
) -> MCPSettingsResponse:
    """
    Get current MCP settings for user.
    """
    user_id = current_user.get("sub")
    del request
    logger.info("Fetching MCP settings for user %s", user_id)
    return MCPService.get_settings()
