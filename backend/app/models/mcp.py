"""MCP token management models."""
from pydantic import BaseModel, Field


class MCPTokenCreateRequest(BaseModel):
    """Request model for MCP token generation."""
    name: str = Field(..., min_length=1, max_length=100, description="Purpose/usage of the API key")


class MCPTokenResponse(BaseModel):
    """Response model for MCP token generation."""
    id: str = Field(..., description="Token ID")
    name: str = Field(..., description="Purpose/usage of the API key")
    token: str = Field(..., description="API key token (only shown once)")
    created_at: str = Field(..., description="ISO format creation timestamp")
    expires_at: str = Field(..., description="ISO format expiration timestamp")
    expires_in: int = Field(default=3600, description="Token expiration time in seconds")


class MCPTokenListItem(BaseModel):
    """Item in the list of MCP tokens."""
    id: str = Field(..., description="Token ID")
    name: str = Field(..., description="Purpose/usage of the API key")
    created_at: str = Field(..., description="ISO format creation timestamp")
    expires_at: str = Field(..., description="ISO format expiration timestamp")
    revoked_at: str | None = Field(None, description="ISO format revocation timestamp if revoked")
    is_active: bool = Field(..., description="Whether the token is active")


class MCPTokensListResponse(BaseModel):
    """Response model for listing MCP tokens."""
    tokens: list[MCPTokenListItem] = Field(..., description="List of API keys")


class MCPSettingsResponse(BaseModel):
    """Response model for MCP settings."""
    server_url: str = Field(..., description="MCP server URL")
    token_expires_in: int = Field(default=3600, description="Token expiration time in seconds")
