import hashlib
import logging
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.models.mcp import (
    MCPSettingsResponse,
    MCPTokenCreateRequest,
    MCPTokenResponse,
    MCPTokensListResponse,
)
from app.models.mcp_token import MCPToken

logger = logging.getLogger(__name__)

MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL", "")

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


@router.post("/tokens", response_model=MCPTokenResponse)
async def generate_mcp_token(
    request: MCPTokenCreateRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
) -> MCPTokenResponse:
    """
    Generate a new MCP API key for current user.
    Maximum 2 active tokens per user.
    """
    user_id = current_user.get("sub")

    # Calculate expiration based on selected option
    if request.expires_in_days is None:
        # No expiration - limit to 1 token
        active_tokens = session.exec(
            select(MCPToken).where(
                MCPToken.user_id == user_id,
                MCPToken.revoked_at.is_(None),
                MCPToken.expires_at.is_(None),
            )
        ).all()
        if len(active_tokens) >= 1:
            raise HTTPException(
                status_code=400,
                detail="Maximum of 1 non-expiring API key per user. Revoke an existing key first."
            )
        expires_at = None
        expires_in = None
        expires_in_days = None
    else:
        expires_at = datetime.now(UTC) + timedelta(days=request.expires_in_days)
        expires_in = request.expires_in_days * 24 * 3600
        expires_in_days = request.expires_in_days

        # Check token limit (max 2 active tokens for expiring tokens)
        active_tokens = session.exec(
            select(MCPToken).where(
                MCPToken.user_id == user_id,
                MCPToken.revoked_at.is_(None),
                MCPToken.expires_at > datetime.now(UTC)
            )
        ).all()

        if len(active_tokens) >= 2:
            raise HTTPException(
                status_code=400,
                detail="Maximum of 2 active API keys per user. Revoke an existing key first."
            )

    # Generate a random short token
    token_plain = f"mcp_{secrets.token_urlsafe(32)}"
    token_hash = hashlib.sha256(token_plain.encode()).hexdigest()

    # Store token in database
    new_token = MCPToken(
        user_id=user_id,
        token_hash=token_hash,
        name=request.name,
        created_at=datetime.now(UTC),
        expires_at=expires_at
    )

    session.add(new_token)
    session.commit()
    session.refresh(new_token)

    logger.info(f"Generated MCP API key for user {user_id}: {new_token.name}, expires_in_days={expires_in_days}")

    # Return response with full plain token (only shown once)
    return MCPTokenResponse(
        id=str(new_token.id),
        name=new_token.name,
        token=token_plain,
        created_at=new_token.created_at.isoformat(),
        expires_at=new_token.expires_at.isoformat() if new_token.expires_at else None,
        expires_in=expires_in if expires_in else 365 * 24 * 3600,
        expires_in_days=expires_in_days
    )


@router.get("/tokens", response_model=MCPTokensListResponse)
async def list_mcp_tokens(
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
) -> MCPTokensListResponse:
    """
    List all MCP API keys for the current user.
    Does not return the actual token value.
    """
    try:
        user_id = current_user.get("sub")
        logger.info(f"Listing MCP tokens for user_id: {user_id}")

        tokens = session.exec(
            select(MCPToken).where(MCPToken.user_id == user_id)
        ).all()

        logger.info(f"Found {len(tokens)} MCP tokens for user {user_id}")

        token_list = [
            {
                "id": str(token.id),
                "name": token.name,
                "created_at": token.created_at.isoformat(),
                "expires_at": token.expires_at.isoformat() if token.expires_at else None,
                "revoked_at": token.revoked_at.isoformat() if token.revoked_at else None,
                "is_active": token.is_active,
                "last_used_at": token.last_used_at.isoformat() if token.last_used_at else None,
                "expires_in_days": (token.expires_at - token.created_at).days if token.expires_at else None,
            }
            for token in tokens
        ]

        return MCPTokensListResponse(tokens=token_list)
    except Exception as e:
        logger.error(f"Error listing MCP tokens: {e}", exc_info=True)
        raise


@router.post("/tokens/{token_id}/revoke")
async def revoke_mcp_token(
    token_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
) -> Response:
    """
    Revoke (deactivate) a specific MCP API key.
    """
    user_id = current_user.get("sub")

    try:
        token_uuid = UUID(token_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="API key not found")

    token = session.exec(
        select(MCPToken).where(
            MCPToken.id == token_uuid,
            MCPToken.user_id == user_id
        )
    ).first()

    if not token:
        raise HTTPException(status_code=404, detail="API key not found")

    if token.revoked_at:
        raise HTTPException(status_code=400, detail="API key already revoked")

    token.revoked_at = datetime.now(UTC)
    session.add(token)
    session.commit()

    logger.info(f"Revoked MCP API key {token_id} for user {user_id}")
    return Response(
        status_code=200,
        content='{"message":"API key revoked successfully"}'
    )


@router.post("/tokens/{token_id}/restore")
async def restore_mcp_token(
    token_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
) -> Response:
    """
    Restore (reactivate) a revoked MCP API key.
    """
    user_id = current_user.get("sub")

    try:
        token_uuid = UUID(token_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="API key not found")

    token = session.exec(
        select(MCPToken).where(
            MCPToken.id == token_uuid,
            MCPToken.user_id == user_id
        )
    ).first()

    if not token:
        raise HTTPException(status_code=404, detail="API key not found")

    # Only allow restoring revoked tokens
    if not token.revoked_at:
        raise HTTPException(
            status_code=400,
            detail="Can only restore revoked API keys"
        )

    token.revoked_at = None
    session.add(token)
    session.commit()

    logger.info(f"Restored MCP API key {token_id} for user {user_id}")
    return Response(
        status_code=200,
        content='{"message":"API key restored successfully"}'
    )


@router.delete("/tokens/{token_id}")
async def delete_mcp_token(
    token_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)]
) -> Response:
    """
    Delete a specific MCP API key permanently.
    """
    user_id = current_user.get("sub")

    try:
        token_uuid = UUID(token_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="API key not found")

    token = session.exec(
        select(MCPToken).where(
            MCPToken.id == token_uuid,
            MCPToken.user_id == user_id
        )
    ).first()

    if not token:
        raise HTTPException(status_code=404, detail="API key not found")

    session.delete(token)
    session.commit()

    logger.info(f"Deleted MCP API key {token_id} for user {user_id}")
    return Response(
        status_code=200,
        content='{"message":"API key deleted successfully"}'
    )


@router.get("/settings", response_model=MCPSettingsResponse)
async def get_mcp_settings(
    request: Request,
    current_user: Annotated[dict, Depends(get_current_user)]
) -> MCPSettingsResponse:
    """
    Get current MCP settings for user.
    """
    user_id = current_user.get("sub")

    logger.info(f"Fetching MCP settings for user {user_id}")

    return MCPSettingsResponse(
        server_url=MCP_SERVER_URL,
        token_expires_in=3600,
        token_expiration_options=[30, 60, 90, 365]
    )
