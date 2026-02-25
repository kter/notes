"""Tests for MCP token API endpoints."""

from uuid import UUID

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


class TestRevokeMcpToken:
    """Tests for POST /api/mcp/tokens/{token_id}/revoke"""

    def test_revoke_token_success(self, client: TestClient, session: Session):
        """Test successful token revocation."""
        # Create a token
        create_response = client.post(
            "/api/mcp/tokens",
            json={"name": "Test Token"},
        )
        token_id = create_response.json()["id"]

        # Revoke the token
        revoke_response = client.post(f"/api/mcp/tokens/{token_id}/revoke")

        assert revoke_response.status_code == 200

        # Verify token is revoked in database
        token = session.exec(select(MCPToken).where(MCPToken.id == UUID(token_id))).first()
        assert token is not None
        assert token.revoked_at is not None

    def test_revoke_token_not_found(self, client: TestClient):
        """Test revoking non-existent token."""
        response = client.post("/api/mcp/tokens/non-existent-id/revoke")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"]

    def test_revoke_token_already_revoked(self, client: TestClient, session: Session):
        """Test revoking an already revoked token."""
        # Create a token
        create_response = client.post(
            "/api/mcp/tokens",
            json={"name": "Test Token"},
        )
        token_id = create_response.json()["id"]

        # Revoke the token once
        client.post(f"/api/mcp/tokens/{token_id}/revoke")

        # Try to revoke again
        response = client.post(f"/api/mcp/tokens/{token_id}/revoke")

        assert response.status_code == 400
        assert "already revoked" in response.json()["detail"]


class TestRestoreMcpToken:
    """Tests for POST /api/mcp/tokens/{token_id}/restore"""

    def test_restore_token_success(self, client: TestClient, session: Session):
        """Test successful token restoration."""
        # Create a token
        create_response = client.post(
            "/api/mcp/tokens",
            json={"name": "Test Token"},
        )
        token_id = create_response.json()["id"]

        # Revoke the token
        client.post(f"/api/mcp/tokens/{token_id}/revoke")

        # Restore the token
        restore_response = client.post(f"/api/mcp/tokens/{token_id}/restore")

        assert restore_response.status_code == 200

        # Verify token is restored in database
        token = session.exec(select(MCPToken).where(MCPToken.id == UUID(token_id))).first()
        assert token is not None
        assert token.revoked_at is None

    def test_restore_token_not_found(self, client: TestClient):
        """Test restoring non-existent token."""
        response = client.post("/api/mcp/tokens/non-existent-id/restore")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"]

    def test_restore_token_not_revoked(self, client: TestClient):
        """Test restoring an active (non-revoked) token."""
        # Create a token
        create_response = client.post(
            "/api/mcp/tokens",
            json={"name": "Test Token"},
        )
        token_id = create_response.json()["id"]

        # Try to restore without revoking first
        response = client.post(f"/api/mcp/tokens/{token_id}/restore")

        assert response.status_code == 400
        assert "Can only restore revoked" in response.json()["detail"]


class TestDeleteMcpToken:
    """Tests for DELETE /api/mcp/tokens/{token_id}"""

    def test_delete_token_success(self, client: TestClient, session: Session):
        """Test successful token deletion."""
        # Create a token
        create_response = client.post(
            "/api/mcp/tokens",
            json={"name": "Test Token"},
        )
        token_id = create_response.json()["id"]

        # Delete the token
        delete_response = client.delete(f"/api/mcp/tokens/{token_id}")

        assert delete_response.status_code == 200

        # Verify token is deleted from database
        token = session.exec(select(MCPToken).where(MCPToken.id == UUID(token_id))).first()
        assert token is None

    def test_delete_token_not_found(self, client: TestClient):
        """Test deleting non-existent token."""
        response = client.delete("/api/mcp/tokens/non-existent-id")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"]

