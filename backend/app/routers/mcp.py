import hashlib
import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlmodel import Session

from app.auth import get_current_user
from app.database import get_session
from app.models.mcp import MCPSettingsResponse, MCPTokenResponse
from app.models.mcp_token import MCPToken

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


@router.post("/token", response_model=MCPTokenResponse)
async def generate_mcp_token(
    request: Request,
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
) -> MCPTokenResponse:
    """
    Generate a short, persistent MCP token for the current authenticated user.
    """
    user_id = current_user.get("sub")
    
    # Generate a random short token
    # 32 bytes of randomness results in ~43 chars URL-safe
    token_plain = f"mcp_{secrets.token_urlsafe(32)}"
    token_hash = hashlib.sha256(token_plain.encode()).hexdigest()

    # Store the token in the database
    # We revoke old tokens for this user for now to keep it simple (one token per user)
    from sqlmodel import select
    old_tokens = session.exec(
        select(MCPToken).where(MCPToken.user_id == user_id, MCPToken.revoked_at.is_(None))
    ).all()
    
    import datetime
    now = datetime.datetime.now(datetime.UTC)
    for old_token in old_tokens:
        old_token.revoked_at = now
        session.add(old_token)

    new_token = MCPToken(
        user_id=user_id,
        token_hash=token_hash,
        name="Default",
        created_at=now
    )
    session.add(new_token)
    session.commit()

    logger.info(f"Generated short MCP token for user {user_id}")

    return MCPTokenResponse(
        url="https://5gcqmlela7.execute-api.ap-northeast-1.amazonaws.com/",
        token=token_plain,
        expires_in=365 * 24 * 3600  # 1 year
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
