"""Integration tests for MCP Server.

These tests verify the MCP server functionality with actual AWS services.
Run with: pytest tests/test_mcp_integration.py -v
"""

import asyncio
import json
import os
from typing import Any

import boto3
import pytest
import requests
from jose import jwk, jwt
from jose.exceptions import JWTError

# Configuration from environment
MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL")
AUTH_MANAGER_URL = os.environ.get("AUTH_MANAGER_URL")
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID")
COGNITO_CLIENT_ID = os.environ.get("COGNITO_CLIENT_ID")
TEST_USER_EMAIL = os.environ.get("TEST_USER_EMAIL")
TEST_USER_PASSWORD = os.environ.get("TEST_USER_PASSWORD")
COGNITO_REGION = os.environ.get("COGNITO_REGION", "ap-northeast-1")

# Cognito client
cognito_client = boto3.client("cognito-idp", region_name=COGNITO_REGION)


def get_test_token() -> str:
    """Get a valid JWT token for testing.

    Returns:
        JWT access token string

    Raises:
        AssertionError: If credentials not configured
    """
    if not all([TEST_USER_EMAIL, TEST_USER_PASSWORD, COGNITO_CLIENT_ID]):
        raise AssertionError(
            "Test credentials not configured. Set TEST_USER_EMAIL, TEST_USER_PASSWORD, and COGNITO_CLIENT_ID"
        )

    response = cognito_client.initiate_auth(
        ClientId=COGNITO_CLIENT_ID,
        AuthFlow="USER_PASSWORD_AUTH",
        AuthParameters={
            "USERNAME": TEST_USER_EMAIL,
            "PASSWORD": TEST_USER_PASSWORD,
        },
    )

    return response["AuthenticationResult"]["AccessToken"]


def get_jwks() -> dict:
    """Fetch Cognito JWKS for token verification.

    Returns:
        JWKS dictionary
    """
    url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    response = requests.get(url, timeout=5)
    response.raise_for_status()
    return response.json()


def verify_token(token: str) -> dict:
    """Verify a JWT token.

    Args:
        token: JWT token string

    Returns:
        Decoded token payload
    """
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")

    jwks = get_jwks()

    rsa_key = None
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            rsa_key = jwk.construct(key)
            break

    if rsa_key is None:
        raise ValueError("Unable to find matching signing key")

    payload = jwt.decode(
        token,
        rsa_key.to_pem().public_key(),
        algorithms=["RS256"],
        options={"verify_aud": False},
    )

    return payload


@pytest.mark.integration
class TestMCPAuthManager:
    """Test MCP Auth Manager endpoints."""

    @pytest.fixture
    def auth_token(self) -> str:
        """Get test auth token."""
        return get_test_token()

    @pytest.fixture
    def headers(self, auth_token: str) -> dict[str, str]:
        """Get request headers with auth token."""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_create_mcp_client(self, headers: dict[str, str]) -> None:
        """Test creating a new MCP client."""
        if not AUTH_MANAGER_URL:
            pytest.skip("AUTH_MANAGER_URL not configured")

        response = requests.post(
            f"{AUTH_MANAGER_URL}/api/mcp/create-client",
            headers=headers,
            json={"name": "Test Client", "description": "Integration test client"},
            timeout=10,
        )

        assert response.status_code == 200
        data = response.json()

        assert "client_id" in data
        assert "client_secret" in data
        assert "configuration_url" in data
        assert "notes" in data

        # Clean up: revoke the created client
        client_id = data["client_id"]
        self._cleanup_client(client_id, headers)

    def test_list_mcp_clients(self, headers: dict[str, str]) -> None:
        """Test listing MCP clients."""
        if not AUTH_MANAGER_URL:
            pytest.skip("AUTH_MANAGER_URL not configured")

        response = requests.get(
            f"{AUTH_MANAGER_URL}/api/mcp/list-clients",
            headers=headers,
            timeout=10,
        )

        assert response.status_code == 200
        data = response.json()

        assert "clients" in data
        assert isinstance(data["clients"], list)

    def test_revoke_mcp_client(self, headers: dict[str, str]) -> None:
        """Test revoking an MCP client."""
        if not AUTH_MANAGER_URL:
            pytest.skip("AUTH_MANAGER_URL not configured")

        # First create a client
        create_response = requests.post(
            f"{AUTH_MANAGER_URL}/api/mcp/create-client",
            headers=headers,
            json={"name": "Test Client to Revoke"},
            timeout=10,
        )

        assert create_response.status_code == 200
        client_id = create_response.json()["client_id"]

        # Now revoke it
        revoke_response = requests.delete(
            f"{AUTH_MANAGER_URL}/api/mcp/revoke-client",
            headers=headers,
            json={"client_id": client_id},
            timeout=10,
        )

        assert revoke_response.status_code == 200
        data = revoke_response.json()
        assert "message" in data
        assert data["client_id"] == client_id

        # Verify client is gone by trying to describe it
        try:
            cognito_client.describe_user_pool_client(
                UserPoolId=COGNITO_USER_POOL_ID, ClientId=client_id
            )
            assert False, "Client should have been deleted"
        except cognito_client.exceptions.ResourceNotFoundException:
            pass  # Expected

    def test_revoke_nonexistent_client(self, headers: dict[str, str]) -> None:
        """Test revoking a non-existent client."""
        if not AUTH_MANAGER_URL:
            pytest.skip("AUTH_MANAGER_URL not configured")

        response = requests.delete(
            f"{AUTH_MANAGER_URL}/api/mcp/revoke-client",
            headers=headers,
            json={"client_id": "nonexistent-client-id"},
            timeout=10,
        )

        assert response.status_code == 404

    def test_unauthorized_access(self) -> None:
        """Test that unauthorized requests are rejected."""
        if not AUTH_MANAGER_URL:
            pytest.skip("AUTH_MANAGER_URL not configured")

        response = requests.post(
            f"{AUTH_MANAGER_URL}/api/mcp/create-client",
            headers={
                "Authorization": "Bearer invalid-token",
                "Content-Type": "application/json",
            },
            json={"name": "Test"},
            timeout=10,
        )

        assert response.status_code == 401

    def test_configure_client(self, headers: dict[str, str]) -> None:
        """Test getting client configuration."""
        if not AUTH_MANAGER_URL:
            pytest.skip("AUTH_MANAGER_URL not configured")

        # Create a client first
        create_response = requests.post(
            f"{AUTH_MANAGER_URL}/api/mcp/create-client",
            headers=headers,
            json={"name": "Test Config Client"},
            timeout=10,
        )

        assert create_response.status_code == 200
        client_id = create_response.json()["client_id"]

        # Get configuration
        config_response = requests.get(
            f"{AUTH_MANAGER_URL}/api/mcp/configure-client/{client_id}",
            headers=headers,
            timeout=10,
        )

        assert config_response.status_code == 200
        config = config_response.json()

        assert "mcpServers" in config
        assert "instructions" in config

        # Clean up
        self._cleanup_client(client_id, headers)

    def _cleanup_client(self, client_id: str, headers: dict[str, str]) -> None:
        """Helper to clean up a test client."""
        try:
            requests.delete(
                f"{AUTH_MANAGER_URL}/api/mcp/revoke-client",
                headers=headers,
                json={"client_id": client_id},
                timeout=10,
            )
        except Exception:
            pass  # Best effort cleanup


@pytest.mark.integration
class TestMCPServer:
    """Test MCP Server SSE endpoint."""

    @pytest.fixture
    def auth_token(self) -> str:
        """Get test auth token."""
        return get_test_token()

    def test_health_check(self) -> None:
        """Test MCP server health check endpoint."""
        if not MCP_SERVER_URL:
            pytest.skip("MCP_SERVER_URL not configured")

        response = requests.get(f"{MCP_SERVER_URL}/health", timeout=10)

        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] == "ok"

    def test_get_resources(self, auth_token: str) -> None:
        """Test GET /resources endpoint."""
        if not MCP_SERVER_URL:
            pytest.skip("MCP_SERVER_URL not configured")

        response = requests.get(
            f"{MCP_SERVER_URL}/resources",
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=10,
        )

        assert response.status_code == 200
        data = response.json()

        assert "resources" in data
        resources = data["resources"]
        assert isinstance(resources, list)

        # If resources exist, verify structure
        if resources:
            # Check notes
            note_resources = [r for r in resources if r["uri"].startswith("notes://note/")]
            for note in note_resources:
                assert "uri" in note
                assert "name" in note
                assert "description" in note
                assert "mimeType" in note
                assert note["mimeType"] == "text/markdown"
                assert note["uri"].startswith("notes://note/")

            # Check folders
            folder_resources = [r for r in resources if r["uri"].startswith("notes://folder/")]
            for folder in folder_resources:
                assert "uri" in folder
                assert "name" in folder
                assert "description" in folder
                assert "mimeType" in folder
                assert folder["mimeType"] == "application/json"
                assert folder["uri"].startswith("notes://folder/")

    def test_get_resources_unauthorized(self) -> None:
        """Test that unauthorized requests to /resources are rejected."""
        if not MCP_SERVER_URL:
            pytest.skip("MCP_SERVER_URL not configured")

        response = requests.get(
            f"{MCP_SERVER_URL}/resources",
            headers={"Authorization": "Bearer invalid-token"},
            timeout=10,
        )

        assert response.status_code == 401

    def test_get_resources_no_auth_header(self) -> None:
        """Test that requests without auth header are rejected."""
        if not MCP_SERVER_URL:
            pytest.skip("MCP_SERVER_URL not configured")

        response = requests.get(
            f"{MCP_SERVER_URL}/resources",
            timeout=10,
        )

        assert response.status_code == 401

    def test_unauthorized_request(self) -> None:
        """Test that unauthorized requests are rejected."""
        if not MCP_SERVER_URL:
            pytest.skip("MCP_SERVER_URL not configured")

        response = requests.post(
            MCP_SERVER_URL,
            headers={
                "Authorization": "Bearer invalid-token",
                "Content-Type": "application/json",
            },
            json={
                "jsonrpc": "2.0",
                "method": "resources/list",
                "id": 1,
            },
            timeout=10,
        )

        assert response.status_code == 401

    def test_list_resources(self, auth_token: str) -> None:
        """Test listing notes as MCP resources."""
        if not MCP_SERVER_URL:
            pytest.skip("MCP_SERVER_URL not configured")

        response = requests.post(
            MCP_SERVER_URL,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            json={
                "jsonrpc": "2.0",
                "method": "resources/list",
                "id": 1,
            },
            timeout=30,  # SSE may take longer
        )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

        # Parse SSE response
        lines = response.text.strip().split("\n")
        assert len(lines) >= 2  # At least "data:" line and empty line

        # Extract JSON from SSE data line
        data_line = [l for l in lines if l.startswith("data:")][0]
        json_str = data_line[5:]  # Remove "data:" prefix

        result = json.loads(json_str)

        assert "jsonrpc" in result
        assert result["jsonrpc"] == "2.0"
        assert "id" in result
        assert result["id"] == 1
        assert "result" in result

        # Result should be a list of resources
        resources = result["result"]
        if resources:
            # If user has notes, verify structure
            resource = resources[0]
            assert "uri" in resource
            assert "name" in resource
            assert "mimeType" in resource
            assert resource["mimeType"] == "text/markdown"
            assert resource["uri"].startswith("notes://")

    def test_read_resource(self, auth_token: str) -> None:
        """Test reading a specific note."""
        if not MCP_SERVER_URL:
            pytest.skip("MCP_SERVER_URL not configured")

        # First, get a list of resources to find a note ID
        list_response = requests.post(
            MCP_SERVER_URL,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            json={
                "jsonrpc": "2.0",
                "method": "resources/list",
                "id": 1,
            },
            timeout=30,
        )

        if list_response.status_code != 200:
            pytest.skip("Failed to list resources")

        # Parse SSE response to get resources
        lines = list_response.text.strip().split("\n")
        data_line = [l for l in lines if l.startswith("data:")][0]
        json_str = data_line[5:]
        list_result = json.loads(json_str)

        resources = list_result.get("result", [])
        if not resources:
            pytest.skip("No notes available for test user")

        # Read the first note
        note_uri = resources[0]["uri"]

        read_response = requests.post(
            MCP_SERVER_URL,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            json={
                "jsonrpc": "2.0",
                "method": "resources/read",
                "id": 2,
                "params": {
                    "uri": note_uri,
                },
            },
            timeout=30,
        )

        assert read_response.status_code == 200
        assert "text/event-stream" in read_response.headers.get("content-type", "")

        # Parse SSE response
        read_lines = read_response.text.strip().split("\n")
        read_data_line = [l for l in read_lines if l.startswith("data:")][0]
        read_json_str = read_data_line[5:]
        read_result = json.loads(read_json_str)

        assert "jsonrpc" in read_result
        assert read_result["id"] == 2
        assert "result" in read_result

        # Verify content structure
        contents = read_result["result"]
        assert "contents" in contents
        assert len(contents["contents"]) > 0

        content = contents["contents"][0]
        assert "uri" in content
        assert content["uri"] == note_uri
        assert "text" in content
        assert "mimeType" in content
        assert content["mimeType"] == "text/markdown"

    def test_invalid_method(self, auth_token: str) -> None:
        """Test that invalid RPC methods return error."""
        if not MCP_SERVER_URL:
            pytest.skip("MCP_SERVER_URL not configured")

        response = requests.post(
            MCP_SERVER_URL,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            json={
                "jsonrpc": "2.0",
                "method": "invalid/method",
                "id": 1,
            },
            timeout=30,
        )

        assert response.status_code == 200

        lines = response.text.strip().split("\n")
        data_line = [l for l in lines if l.startswith("data:")][0]
        json_str = data_line[5:]
        result = json.loads(json_str)

        assert "error" in result
        assert result["error"]["code"] == -32601

    def test_malformed_request(self, auth_token: str) -> None:
        """Test that malformed requests return error."""
        if not MCP_SERVER_URL:
            pytest.skip("MCP_SERVER_URL not configured")

        response = requests.post(
            MCP_SERVER_URL,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            json={
                "jsonrpc": "2.0",
                "method": "resources/read",
                "id": 1,
                "params": {},  # Missing required 'uri' param
            },
            timeout=30,
        )

        assert response.status_code == 200

        lines = response.text.strip().split("\n")
        data_line = [l for l in lines if l.startswith("data:")][0]
        json_str = data_line[5:]
        result = json.loads(json_str)

        assert "error" in result


@pytest.mark.integration
def test_data_isolation() -> None:
    """Test that users cannot access each other's notes.

    This test requires two test users to be configured:
    - TEST_USER_EMAIL_1 / TEST_USER_PASSWORD_1
    - TEST_USER_EMAIL_2 / TEST_USER_PASSWORD_2
    """
    if not MCP_SERVER_URL:
        pytest.skip("MCP_SERVER_URL not configured")

    email1 = os.environ.get("TEST_USER_EMAIL_2")
    password1 = os.environ.get("TEST_USER_PASSWORD_2")
    email2 = os.environ.get("TEST_USER_EMAIL_3")
    password2 = os.environ.get("TEST_USER_PASSWORD_3")

    if not all([email1, password1, email2, password2]):
        pytest.skip("Multiple test users not configured for isolation test")

    # Get tokens for both users
    token1 = get_test_token_override(email1, password1)
    token2 = get_test_token_override(email2, password2)

    # List resources for user 1
    response1 = requests.post(
        MCP_SERVER_URL,
        headers={
            "Authorization": f"Bearer {token1}",
            "Content-Type": "application/json",
        },
        json={
            "jsonrpc": "2.0",
            "method": "resources/list",
            "id": 1,
        },
        timeout=30,
    )

    # List resources for user 2
    response2 = requests.post(
        MCP_SERVER_URL,
        headers={
            "Authorization": f"Bearer {token2}",
            "Content-Type": "application/json",
        },
        json={
            "jsonrpc": "2.0",
            "method": "resources/list",
            "id": 1,
        },
        timeout=30,
    )

    # Both should succeed
    assert response1.status_code == 200
    assert response2.status_code == 200

    # Parse results
    lines1 = response1.text.strip().split("\n")
    data_line1 = [l for l in lines1 if l.startswith("data:")][0]
    result1 = json.loads(data_line1[5:])

    lines2 = response2.text.strip().split("\n")
    data_line2 = [l for l in lines2 if l.startswith("data:")][0]
    result2 = json.loads(data_line2[5:])

    # Verify they're different sets of resources (or at least not identical)
    resources1 = result1.get("result", [])
    resources2 = result2.get("result", [])

    # Extract note URIs
    uris1 = {r["uri"] for r in resources1}
    uris2 = {r["uri"] for r in resources2}

    # They should not be the same
    assert uris1 != uris2 or len(uris1) == 0


def get_test_token_override(email: str, password: str) -> str:
    """Get a JWT token for specific credentials."""
    response = cognito_client.initiate_auth(
        ClientId=COGNITO_CLIENT_ID,
        AuthFlow="USER_PASSWORD_AUTH",
        AuthParameters={"USERNAME": email, "PASSWORD": password},
    )
    return response["AuthenticationResult"]["AccessToken"]
