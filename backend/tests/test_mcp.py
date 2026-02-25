"""Tests for MCP token API endpoints."""

from datetime import UTC, datetime
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.mcp_token import MCPToken


class TestGenerateMcpToken:
    """Tests for POST /api/mcp/tokens"""

    def test_generate_token_success(self, client: TestClient, session: Session):
        """Test successful token generation."""
        response = client.post(
            "/api/mcp/tokens",
            json={"name": "Test Token"},
        )

        assert response.status_code == 200
        data = response.json()

        # Check response structure
        assert "id" in data
        assert "name" in data
        assert "token" in data
        assert data["name"] == "Test Token"
        assert data["token"].startswith("mcp_")

        # Verify token hash is stored in database
        tokens = list(session.exec(select(MCPToken)).all())
        assert len(tokens) == 1
        assert tokens[0].name == "Test Token"
        assert tokens[0].token_hash is not None

    def test_generate_token_requires_name(self, client: TestClient):
        """Test that name is required."""
        response = client.post(
            "/api/mcp/tokens",
            json={},
        )

        assert response.status_code == 422

    def test_generate_token_limit_2_active(self, client: TestClient):
        """Test that maximum 2 active tokens are allowed."""
        # Create first token
        response1 = client.post(
            "/api/mcp/tokens",
            json={"name": "Token 1"},
        )
        assert response1.status_code == 200

        # Create second token
        response2 = client.post(
            "/api/mcp/tokens",
            json={"name": "Token 2"},
        )
        assert response2.status_code == 200

        # Try to create third token - should fail
        response3 = client.post(
            "/api/mcp/tokens",
            json={"name": "Token 3"},
        )
        assert response3.status_code == 400
        assert "Maximum of 2 active API keys" in response3.json()["detail"]

    def test_generate_token_does_not_return_hash(self, client: TestClient):
        """Test that token hash is not returned."""
        response = client.post(
            "/api/mcp/tokens",
            json={"name": "Test Token"},
        )

        assert response.status_code == 200
        data = response.json()

        # Token hash should not be in response
        assert "token_hash" not in data
        # Plain token should be returned
        assert "token" in data


class TestListMcpTokens:
    """Tests for GET /api/mcp/tokens"""

    def test_list_tokens_empty(self, client: TestClient):
        """Test listing tokens when none exist."""
        response = client.get("/api/mcp/tokens")

        assert response.status_code == 200
        data = response.json()

        assert "tokens" in data
        assert data["tokens"] == []

    def test_list_tokens_returns_all_tokens(self, client: TestClient):
        """Test listing all tokens for user."""
        # Create 2 tokens
        client.post("/api/mcp/tokens", json={"name": "Token 1"})
        client.post("/api/mcp/tokens", json={"name": "Token 2"})

        response = client.get("/api/mcp/tokens")

        assert response.status_code == 200
        data = response.json()

        assert len(data["tokens"]) == 2

    def test_list_tokens_does_not_return_plain_token(self, client: TestClient):
        """Test that plain token is not returned in list."""
        # Create a token
        create_response = client.post(
            "/api/mcp/tokens",
            json={"name": "Test Token"},
        )
        plain_token = create_response.json()["token"]

        # List tokens
        list_response = client.get("/api/mcp/tokens")

        assert list_response.status_code == 200
        tokens = list_response.json()["tokens"]

        # Plain token should not be in the list
        assert "token" not in tokens[0]
        # Plain token should not appear anywhere
        assert plain_token not in str(tokens)

    def test_list_tokens_with_timezone_aware_datetime(self, client: TestClient):
        """Test that timezone-aware datetimes from database are handled."""
        # This test verifies the fix for timezone comparison issue
        # Create a token
        client.post("/api/mcp/tokens", json={"name": "Test Token"})

        # List tokens should not raise TypeError
        response = client.get("/api/mcp/tokens")
        assert response.status_code == 200
        data = response.json()
        assert len(data["tokens"]) == 1


class TestGetMcpSettings:
    """Tests for GET /api/mcp/settings"""

    def test_get_settings_success(self, client: TestClient):
        """Test getting MCP settings."""
        response = client.get("/api/mcp/settings")

        assert response.status_code == 200
        data = response.json()

        assert "server_url" in data
        assert "token_expires_in" in data
