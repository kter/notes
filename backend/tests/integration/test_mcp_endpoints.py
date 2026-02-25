"""Integration tests for MCP token API endpoints."""



class TestGenerateMcpToken:
    """Integration tests for POST /api/mcp/tokens"""

    def test_generate_token_success(self, client):
        """Test successful token generation against deployed backend."""
        response = client.post("/api/mcp/tokens", json={"name": "Integration Test"})

        assert response.status_code == 200
        data = response.json()

        # Check response structure
        assert "id" in data
        assert "name" in data
        assert "token" in data
        assert data["name"] == "Integration Test"
        assert data["token"].startswith("mcp_")
        assert len(data["token"]) > 40  # Should be reasonably long

    def test_generate_token_missing_name(self, client):
        """Test that name is required."""
        response = client.post("/api/mcp/tokens", json={})

        assert response.status_code == 422

    def test_generate_token_limit_check(self, client):
        """Test that maximum 2 active tokens are enforced."""
        # Create first token
        response1 = client.post(
            "/api/mcp/tokens", json={"name": "Token 1"}
        )
        assert response1.status_code == 200

        # Create second token
        response2 = client.post(
            "/api/mcp/tokens", json={"name": "Token 2"}
        )
        assert response2.status_code == 200

        # Try to create third token - should fail
        response3 = client.post(
            "/api/mcp/tokens", json={"name": "Token 3"}
        )
        assert response3.status_code == 400
        assert "Maximum of 2 active" in response3.json()["detail"]

    def test_generate_token_expiration(self, client):
        """Test that token has proper expiration."""
        response = client.post(
            "/api/mcp/tokens", json={"name": "Test Expiration"}
        )

        assert response.status_code == 200
        data = response.json()

        # Check expires_in is 1 year in seconds
        assert data["expires_in"] == 365 * 24 * 3600

        # Verify expires_at is approximately 1 year from now
        expires_at = data["expires_at"]
        # Just check that expires_at is present and in the future
        assert expires_at is not None
        assert "2027" in expires_at  # Should be approximately 1 year from now


class TestListMcpTokens:
    """Integration tests for GET /api/mcp/tokens"""

    def test_list_tokens_empty(self, client):
        """Test listing tokens when none exist."""
        response = client.get("/api/mcp/tokens")

        assert response.status_code == 200
        data = response.json()

        assert "tokens" in data
        # May have existing tokens from previous tests
        assert isinstance(data["tokens"], list)

    def test_list_tokens_after_creation(self, client):
        """Test that created tokens appear in list."""
        # Create a token
        create_response = client.post(
            "/api/mcp/tokens", json={"name": "List Test Token"}
        )
        created_id = create_response.json()["id"]

        # List tokens
        list_response = client.get("/api/mcp/tokens")

        assert list_response.status_code == 200
        tokens = list_response.json()["tokens"]

        # Find our created token
        created_token = next(
            (t for t in tokens if t["id"] == created_id), None
        )
        assert created_token is not None
        assert created_token["name"] == "List Test Token"
        assert "token" not in created_token  # Plain token should not be exposed

    def test_list_tokens_has_is_active(self, client):
        """Test that is_active field is present and correct."""
        # Create a token
        create_response = client.post(
            "/api/mcp/tokens", json={"name": "Active Test"}
        )
        token_id = create_response.json()["id"]

        # List tokens
        list_response = client.get("/api/mcp/tokens")
        assert list_response.status_code == 200
        tokens = list_response.json()["tokens"]

        # Find our token
        token = next((t for t in tokens if t["id"] == token_id), None)
        assert token is not None
        assert "is_active" in token
        assert token["is_active"] is True


class TestRevokeMcpToken:
    """Integration tests for POST /api/mcp/tokens/{id}/revoke"""

    def test_revoke_token(self, client):
        """Test revoking a token."""
        # Create a token
        create_response = client.post(
            "/api/mcp/tokens", json={"name": "Revoke Test"}
        )
        token_id = create_response.json()["id"]

        # Revoke the token
        revoke_response = client.post(f"/api/mcp/tokens/{token_id}/revoke")

        assert revoke_response.status_code == 200
        assert "revoked successfully" in revoke_response.json()["message"]

        # Verify token is still in list but revoked
        list_response = client.get("/api/mcp/tokens")
        tokens = list_response.json()["tokens"]
        token = next((t for t in tokens if t["id"] == token_id), None)
        assert token is not None
        assert token["is_active"] is False
        assert token["revoked_at"] is not None

    def test_revoke_nonexistent(self, client):
        """Test revoking a non-existent token."""
        response = client.post(
            "/api/mcp/tokens/00000000-0000-0000-0000-000000000000/revoke"
        )

        assert response.status_code == 404


class TestDeleteMcpToken:
    """Integration tests for DELETE /api/mcp/tokens/{id}"""

    def test_delete_token(self, client):
        """Test deleting a token."""
        # Create a token
        create_response = client.post(
            "/api/mcp/tokens", json={"name": "Delete Test"}
        )
        token_id = create_response.json()["id"]

        # Delete the token
        delete_response = client.delete(f"/api/mcp/tokens/{token_id}")

        assert delete_response.status_code == 200
        assert "deleted successfully" in delete_response.json()["message"]

        # Verify token is gone from list
        list_response = client.get("/api/mcp/tokens")
        tokens = list_response.json()["tokens"]
        token = next((t for t in tokens if t["id"] == token_id), None)
        assert token is None

    def test_delete_nonexistent(self, client):
        """Test deleting a non-existent token."""
        response = client.delete(
            "/api/mcp/tokens/00000000-0000-0000-0000-000000000000"
        )

        assert response.status_code == 404


class TestGetMcpSettings:
    """Integration tests for GET /api/mcp/settings"""

    def test_get_settings(self, client):
        """Test getting MCP settings."""
        response = client.get("/api/mcp/settings")

        assert response.status_code == 200
        data = response.json()

        assert "server_url" in data
        assert data["server_url"].startswith("https://")
        assert "token_expires_in" in data
        assert data["token_expires_in"] == 3600
