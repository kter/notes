import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.auth import get_current_user
from app.features.mcp.dependencies import get_mcp_use_cases
from app.features.mcp.use_cases import MCPUseCases
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
    use_cases: Annotated[MCPUseCases, Depends(get_mcp_use_cases)],
) -> MCPTokenResponse:
    """
    Generate a new MCP API key for current user.
    Maximum 2 active tokens per user.
    """
    del current_user
    return use_cases.generate_token(request)


@router.get("/tokens", response_model=MCPTokensListResponse)
async def list_mcp_tokens(
    current_user: Annotated[dict, Depends(get_current_user)],
    use_cases: Annotated[MCPUseCases, Depends(get_mcp_use_cases)],
) -> MCPTokensListResponse:
    """
    List all MCP API keys for the current user.
    Does not return the actual token value.
    """
    del current_user
    return use_cases.list_tokens()


@router.post("/tokens/{token_id}/revoke")
async def revoke_mcp_token(
    token_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    use_cases: Annotated[MCPUseCases, Depends(get_mcp_use_cases)],
) -> dict[str, str]:
    """
    Revoke (deactivate) a specific MCP API key.
    """
    del current_user
    return use_cases.revoke_token(token_id)


@router.post("/tokens/{token_id}/restore")
async def restore_mcp_token(
    token_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    use_cases: Annotated[MCPUseCases, Depends(get_mcp_use_cases)],
) -> dict[str, str]:
    """
    Restore (reactivate) a revoked MCP API key.
    """
    del current_user
    return use_cases.restore_token(token_id)


@router.delete("/tokens/{token_id}")
async def delete_mcp_token(
    token_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    use_cases: Annotated[MCPUseCases, Depends(get_mcp_use_cases)],
) -> dict[str, str]:
    """
    Delete a specific MCP API key permanently.
    """
    del current_user
    return use_cases.delete_token(token_id)


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
    return MCPUseCases.get_settings()
