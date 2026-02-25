"""MCP Token model for persistent API keys."""
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class MCPToken(SQLModel, table=True):
    """
    Model for storing MCP API tokens.
    
    These tokens are shorter than JWTs and persistent until revoked or expired.
    The plain text token is only shown once to the user (not stored).
    We store a hash of the token just like passwords.
    """
    __tablename__ = "mcp_tokens"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()
    token_hash: str = Field()
    name: str = Field(default="Default")
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC) + timedelta(days=365)
    )
    revoked_at: datetime | None = Field(default=None)

    @property
    def is_active(self) -> bool:
        """Check if the token is active and not expired or revoked."""
        now = datetime.now(UTC)

        # Handle both offset-naive and offset-aware datetimes from database
        if self.expires_at.tzinfo is None:
            expires_at = self.expires_at.replace(tzinfo=UTC)
        else:
            expires_at = self.expires_at

        return self.revoked_at is None and expires_at > now
