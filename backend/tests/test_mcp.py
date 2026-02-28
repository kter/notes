"""Tests for MCP token API endpoints."""

import datetime as dt_module
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
        """Test that maximum 2 active expiring tokens are allowed."""
        # Create first token
        response1 = client.post(
            "/api/mcp/tokens",
            json={"name": "Token 1", "expires_in_days": 30},
        )
        assert response1.status_code == 200

        # Create second token
        response2 = client.post(
            "/api/mcp/tokens",
            json={"name": "Token 2", "expires_in_days": 30},
        )
        assert response2.status_code == 200

        # Try to create third token - should fail
        response3 = client.post(
            "/api/mcp/tokens",
            json={"name": "Token 3", "expires_in_days": 30},
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

    def test_generate_token_with_30_day_expiration(self, client: TestClient, session: Session):
        """Test token generation with 30 day expiration."""
        response = client.post(
            "/api/mcp/tokens",
            json={"name": "Test Token", "expires_in_days": 30},
        )

        assert response.status_code == 200
        data = response.json()

        assert "expires_in_days" in data
        assert data["expires_in_days"] == 30

        # Verify token expires approximately 30 days from now
        token = list(session.exec(select(MCPToken)).all())[0]
        expires_at = token.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=dt_module.UTC)
        days_until_expiration = (expires_at - dt_module.datetime.now(dt_module.UTC)).days
        assert 29 <= days_until_expiration <= 31  # Allow for test timing

    def test_generate_token_with_90_day_expiration(self, client: TestClient):
        """Test token generation with 90 day expiration."""
        response = client.post(
            "/api/mcp/tokens",
            json={"name": "Test Token", "expires_in_days": 90},
        )

        assert response.status_code == 200
        data = response.json()

        assert "expires_in_days" in data
        assert data["expires_in_days"] == 90

    def test_generate_token_no_expiration(self, client: TestClient, session: Session):
        """Test token generation with no expiration."""
        response = client.post(
            "/api/mcp/tokens",
            json={"name": "Test Token", "expires_in_days": None},
        )

        assert response.status_code == 200
        data = response.json()

        assert "expires_in_days" in data
        assert data["expires_in_days"] is None
        assert data["expires_at"] is None

        # Verify token has no expiration
        token = session.exec(select(MCPToken)).all()[0]
        assert token.expires_at is None

    def test_generate_token_no_expiration_limit_1(self, client: TestClient, session: Session):
        """Test maximum 1 non-expiring token per user."""
        # Clean up any existing tokens first
        tokens = session.exec(select(MCPToken).where(MCPToken.user_id == "test-user-123")).all()
        for token in tokens:
            session.delete(token)
        session.commit()

        # Create first non-expiring token
        response1 = client.post(
            "/api/mcp/tokens",
            json={"name": "Token 1", "expires_in_days": None},
        )
        assert response1.status_code == 200

        # Try to create second non-expiring token - should fail
        response2 = client.post(
            "/api/mcp/tokens",
            json={"name": "Token 2", "expires_in_days": None},
        )

        assert response2.status_code == 400
        assert "Maximum of 1 non-expiring" in response2.json()["detail"]

    def test_generate_token_expired_does_not_count_towards_limit(self, client: TestClient, session: Session):
        """Test that expired tokens don't count towards active token limit."""
        # Clean up any existing tokens first
        tokens = session.exec(select(MCPToken).where(MCPToken.user_id == "test-user-123")).all()
        for token in tokens:
            session.delete(token)
        session.commit()

        # Create first token
        response1 = client.post(
            "/api/mcp/tokens",
            json={"name": "Token 1", "expires_in_days": 30},
        )
        assert response1.status_code == 200

        # Manually expire the first token
        token = session.exec(select(MCPToken)).all()[0]
        token.expires_at = dt_module.datetime.now(dt_module.UTC) - dt_module.timedelta(days=1)
        session.add(token)
        session.commit()

        # Create second token - should succeed (first is expired)
        response2 = client.post(
            "/api/mcp/tokens",
            json={"name": "Token 2", "expires_in_days": 30},
        )
        assert response2.status_code == 200


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
        # Token should have expires_at and expires_in_days
        assert data["tokens"][0]["expires_at"] is not None
        assert data["tokens"][0]["expires_in_days"] is not None


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

