"""Unit tests for MCP Auth Manager Lambda (no AWS connection required).

Run with: pytest tests/test_main_unit.py -v
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from jose.exceptions import ExpiredSignatureError, JWTError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_app():
    """Import the auth manager FastAPI app with boto3 mocked."""
    import sys

    # Patch boto3 before import so cognito_client doesn't need real AWS creds
    mock_boto3 = MagicMock()
    mock_cognito = MagicMock()
    mock_boto3.client.return_value = mock_cognito

    # Also patch Mangum so the import doesn't fail
    mock_mangum = MagicMock()

    with patch.dict(
        sys.modules,
        {
            "boto3": mock_boto3,
            "mangum": MagicMock(Mangum=MagicMock(return_value=MagicMock())),
        },
    ):
        sys.modules.pop("main", None)
        import main as auth_main  # noqa: PLC0415

    return TestClient(auth_main.app), auth_main, mock_cognito


# ===========================================================================
# Health check
# ===========================================================================


class TestHealthCheck:
    def test_returns_ok(self):
        client, _, _ = _get_app()
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


# ===========================================================================
# JWT verification (shared logic)
# ===========================================================================


class TestJWTVerification:
    def test_missing_bearer_prefix_returns_401(self):
        client, _, _ = _get_app()
        response = client.get(
            "/api/mcp/list-clients",
            headers={"Authorization": "Token not-bearer"},
        )
        assert response.status_code == 401

    def test_expired_token_returns_401(self):
        client, auth, _ = _get_app()
        with patch.object(auth, "get_jwks", return_value={"keys": []}), \
             patch("main.jwt.get_unverified_header", return_value={"kid": "k"}), \
             patch("main.jwt.decode", side_effect=ExpiredSignatureError("expired")):
            response = client.get(
                "/api/mcp/list-clients",
                headers={"Authorization": "Bearer fake.token"},
            )
        assert response.status_code == 401

    def test_invalid_token_returns_401(self):
        client, auth, _ = _get_app()
        with patch.object(auth, "get_jwks", return_value={"keys": []}), \
             patch("main.jwt.get_unverified_header", return_value={"kid": "k"}), \
             patch("main.jwt.decode", side_effect=JWTError("bad sig")):
            response = client.get(
                "/api/mcp/list-clients",
                headers={"Authorization": "Bearer fake.token"},
            )
        assert response.status_code == 401


# ===========================================================================
# POST /api/mcp/create-client
# ===========================================================================


class TestCreateClient:
    def _mock_valid_jwt(self, auth):
        """Return a patch context that makes verify_jwt_token return a valid payload."""
        return patch.object(
            auth, "verify_jwt_token", return_value={"sub": "user-abc12345"}
        )

    def test_no_auth_header_returns_422(self):
        client, _, _ = _get_app()
        response = client.post(
            "/api/mcp/create-client",
            json={"name": "My Client"},
        )
        assert response.status_code == 422  # FastAPI missing header

    def test_invalid_bearer_returns_401(self):
        client, _, _ = _get_app()
        response = client.post(
            "/api/mcp/create-client",
            json={"name": "My Client"},
            headers={"Authorization": "Token bad"},
        )
        assert response.status_code == 401

    def test_create_success(self):
        client, auth, mock_cognito = _get_app()

        mock_cognito.create_user_pool_client.return_value = {
            "UserPoolClient": {
                "ClientId": "created-client-id",
                "ClientSecret": "super-secret",
            }
        }
        mock_cognito.update_user_pool_client.return_value = {}

        with self._mock_valid_jwt(auth):
            response = client.post(
                "/api/mcp/create-client",
                json={"name": "Test Client"},
                headers={"Authorization": "Bearer valid.token"},
            )

        assert response.status_code == 200
        data = response.json()
        assert "client_id" in data
        assert data["client_id"] == "created-client-id"
        assert "client_secret" in data
        assert "configuration_url" in data

    def test_create_limit_exceeded_returns_429(self):
        client, auth, mock_cognito = _get_app()

        # Both exception classes must be valid BaseException subclasses on mock_cognito.exceptions
        # because main.py has multiple `except cognito_client.exceptions.Xxx:` clauses.
        class NotAuthorizedException(Exception):
            pass

        class LimitExceededException(Exception):
            pass

        mock_cognito.exceptions.NotAuthorizedException = NotAuthorizedException
        mock_cognito.exceptions.LimitExceededException = LimitExceededException
        mock_cognito.create_user_pool_client.side_effect = LimitExceededException("too many")

        with self._mock_valid_jwt(auth):
            response = client.post(
                "/api/mcp/create-client",
                json={"name": "Test Client"},
                headers={"Authorization": "Bearer valid.token"},
            )

        assert response.status_code == 429


# ===========================================================================
# DELETE /api/mcp/revoke-client
# ===========================================================================


class TestRevokeClient:
    def _mock_valid_jwt(self, auth):
        return patch.object(
            auth, "verify_jwt_token", return_value={"sub": "user-abc12345"}
        )

    def test_revoke_nonexistent_client_returns_404(self):
        client, auth, mock_cognito = _get_app()

        mock_cognito.exceptions.ResourceNotFoundException = type(
            "ResourceNotFoundException", (Exception,), {}
        )
        mock_cognito.describe_user_pool_client.side_effect = (
            mock_cognito.exceptions.ResourceNotFoundException("not found")
        )

        with self._mock_valid_jwt(auth):
            response = client.request(
                "DELETE",
                "/api/mcp/revoke-client",
                json={"client_id": "nonexistent-id"},
                headers={"Authorization": "Bearer valid.token"},
            )

        assert response.status_code == 404

    def test_revoke_another_users_client_returns_403(self):
        client, auth, mock_cognito = _get_app()

        mock_cognito.exceptions.ResourceNotFoundException = type(
            "ResourceNotFoundException", (Exception,), {}
        )
        # Client belongs to a DIFFERENT user (prefix won't match "user-abc1")
        mock_cognito.describe_user_pool_client.return_value = {
            "UserPoolClient": {"ClientName": "mcp-otheruser-myclient-abc"}
        }

        with self._mock_valid_jwt(auth):
            response = client.request(
                "DELETE",
                "/api/mcp/revoke-client",
                json={"client_id": "other-client-id"},
                headers={"Authorization": "Bearer valid.token"},
            )

        assert response.status_code == 403

    def test_revoke_own_client_success(self):
        client, auth, mock_cognito = _get_app()

        mock_cognito.exceptions.ResourceNotFoundException = type(
            "ResourceNotFoundException", (Exception,), {}
        )
        # user_id[:8] == "user-abc"
        mock_cognito.describe_user_pool_client.return_value = {
            "UserPoolClient": {"ClientName": "mcp-user-abc-myclient-xyz123"}
        }
        mock_cognito.delete_user_pool_client.return_value = {}

        with self._mock_valid_jwt(auth):
            response = client.request(
                "DELETE",
                "/api/mcp/revoke-client",
                json={"client_id": "valid-client-id"},
                headers={"Authorization": "Bearer valid.token"},
            )

        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["client_id"] == "valid-client-id"


# ===========================================================================
# GET /api/mcp/list-clients
# ===========================================================================


class TestListClients:
    def _mock_valid_jwt(self, auth):
        return patch.object(
            auth, "verify_jwt_token", return_value={"sub": "user-abc12345"}
        )

    def test_returns_only_users_clients(self):
        client, auth, mock_cognito = _get_app()

        mock_cognito.list_user_pool_clients.return_value = {
            "UserPoolClients": [
                {"ClientId": "c1", "ClientName": "mcp-user-abc-myclient-1"},
                {"ClientId": "c2", "ClientName": "mcp-other-someclient-2"},
                {"ClientId": "c3", "ClientName": "mcp-user-abc-anotherclient-3"},
            ]
        }

        with self._mock_valid_jwt(auth):
            response = client.get(
                "/api/mcp/list-clients",
                headers={"Authorization": "Bearer valid.token"},
            )

        assert response.status_code == 200
        data = response.json()
        assert "clients" in data
        client_ids = [c["client_id"] for c in data["clients"]]
        assert "c1" in client_ids
        assert "c3" in client_ids
        assert "c2" not in client_ids  # belongs to another user

    def test_empty_list_when_no_clients(self):
        client, auth, mock_cognito = _get_app()

        mock_cognito.list_user_pool_clients.return_value = {"UserPoolClients": []}

        with self._mock_valid_jwt(auth):
            response = client.get(
                "/api/mcp/list-clients",
                headers={"Authorization": "Bearer valid.token"},
            )

        assert response.status_code == 200
        assert response.json()["clients"] == []
