import hashlib
import logging
import os
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import Response
from sqlmodel import Session, select

from app.db_commit import commit_with_error_handling
from app.models.mcp import (
    MCPSettingsResponse,
    MCPTokenCreateRequest,
    MCPTokenListItem,
    MCPTokenResponse,
    MCPTokensListResponse,
)
from app.models.mcp_token import MCPToken
from app.shared import NotFound, ValidationFailed

logger = logging.getLogger(__name__)

MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL", "")


class MCPService:
    """Application service for MCP token lifecycle flows."""

    def __init__(self, session: Session, user_id: str):
        self.session = session
        self.user_id = user_id

    def generate_token(self, request: MCPTokenCreateRequest) -> MCPTokenResponse:
        expires_at, expires_in, expires_in_days = self._resolve_expiration(request)

        token_plain = f"mcp_{secrets.token_urlsafe(32)}"
        token_hash = hashlib.sha256(token_plain.encode()).hexdigest()

        new_token = MCPToken(
            user_id=self.user_id,
            token_hash=token_hash,
            name=request.name,
            created_at=datetime.now(UTC),
            expires_at=expires_at,
        )

        self.session.add(new_token)
        commit_with_error_handling(self.session, "MCPToken")
        self.session.refresh(new_token)

        logger.info(
            "Generated MCP API key for user %s: %s, expires_in_days=%s",
            self.user_id,
            new_token.name,
            expires_in_days,
        )

        return MCPTokenResponse(
            id=str(new_token.id),
            name=new_token.name,
            token=token_plain,
            created_at=new_token.created_at.isoformat(),
            expires_at=new_token.expires_at.isoformat()
            if new_token.expires_at
            else None,
            expires_in=expires_in,
            expires_in_days=expires_in_days,
        )

    def list_tokens(self) -> MCPTokensListResponse:
        logger.info("Listing MCP tokens for user_id: %s", self.user_id)
        tokens = self.session.exec(
            select(MCPToken).where(MCPToken.user_id == self.user_id)
        ).all()
        logger.info("Found %s MCP tokens for user %s", len(tokens), self.user_id)
        return MCPTokensListResponse(
            tokens=[
                MCPTokenListItem(
                    id=str(token.id),
                    name=token.name,
                    created_at=token.created_at.isoformat(),
                    expires_at=token.expires_at.isoformat()
                    if token.expires_at
                    else None,
                    revoked_at=token.revoked_at.isoformat()
                    if token.revoked_at
                    else None,
                    is_active=token.is_active,
                    last_used_at=token.last_used_at.isoformat()
                    if token.last_used_at
                    else None,
                    expires_in_days=(token.expires_at - token.created_at).days
                    if token.expires_at
                    else None,
                )
                for token in tokens
            ]
        )

    def revoke_token(self, token_id: str) -> Response:
        token = self._get_token(token_id)
        if token.revoked_at:
            raise ValidationFailed("API key already revoked")

        token.revoked_at = datetime.now(UTC)
        self.session.add(token)
        commit_with_error_handling(self.session, "MCPToken")

        logger.info("Revoked MCP API key %s for user %s", token_id, self.user_id)
        return Response(
            status_code=200, content='{"message":"API key revoked successfully"}'
        )

    def restore_token(self, token_id: str) -> Response:
        token = self._get_token(token_id)
        if not token.revoked_at:
            raise ValidationFailed("Can only restore revoked API keys")

        token.revoked_at = None
        self.session.add(token)
        commit_with_error_handling(self.session, "MCPToken")

        logger.info("Restored MCP API key %s for user %s", token_id, self.user_id)
        return Response(
            status_code=200, content='{"message":"API key restored successfully"}'
        )

    def delete_token(self, token_id: str) -> Response:
        token = self._get_token(token_id)
        self.session.delete(token)
        commit_with_error_handling(self.session, "MCPToken")

        logger.info("Deleted MCP API key %s for user %s", token_id, self.user_id)
        return Response(
            status_code=200, content='{"message":"API key deleted successfully"}'
        )

    @staticmethod
    def get_settings() -> MCPSettingsResponse:
        return MCPSettingsResponse(
            server_url=MCP_SERVER_URL,
            token_expires_in=3600,
            token_expiration_options=[30, 60, 90, 365],
        )

    def _resolve_expiration(
        self,
        request: MCPTokenCreateRequest,
    ) -> tuple[datetime | None, int, int | None]:
        now = datetime.now(UTC)
        if request.expires_in_days is None:
            active_tokens = self.session.exec(
                select(MCPToken).where(
                    MCPToken.user_id == self.user_id,
                    MCPToken.revoked_at.is_(None),
                    MCPToken.expires_at.is_(None),
                )
            ).all()
            if len(active_tokens) >= 1:
                raise ValidationFailed(
                    "Maximum of 1 non-expiring API key per user. Revoke an existing key first."
                )
            return None, 365 * 24 * 3600, None

        expires_at = now + timedelta(days=request.expires_in_days)
        active_tokens = self.session.exec(
            select(MCPToken).where(
                MCPToken.user_id == self.user_id,
                MCPToken.revoked_at.is_(None),
                MCPToken.expires_at > now,
            )
        ).all()
        if len(active_tokens) >= 2:
            raise ValidationFailed(
                "Maximum of 2 active API keys per user. Revoke an existing key first."
            )
        return (
            expires_at,
            request.expires_in_days * 24 * 3600,
            request.expires_in_days,
        )

    def _get_token(self, token_id: str) -> MCPToken:
        try:
            token_uuid = UUID(token_id)
        except ValueError as exc:
            raise NotFound("API key not found") from exc

        token = self.session.exec(
            select(MCPToken).where(
                MCPToken.id == token_uuid,
                MCPToken.user_id == self.user_id,
            )
        ).first()
        if token is None:
            raise NotFound("API key not found")
        return token
