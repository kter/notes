"""MCP token management models."""
from pydantic import BaseModel, Field


class MCPTokenRequest(BaseModel):
    """Request model for MCP token generation."""
    pass  # Current user is authenticated via JWT


class MCPTokenResponse(BaseModel):
    """Response model for MCP token generation."""
    url: str = Field(..., description="MCP server URL")
    token: str = Field(..., description="ID token for MCP authentication")
    expires_in: int = Field(default=3600, description="Token expiration time in seconds")


class MCPSettingsResponse(BaseModel):
    """Response model for MCP settings."""
    server_url: str = Field(..., description="MCP server URL")
    token_expires_in: int = Field(default=3600, description="Token expiration time in seconds")
