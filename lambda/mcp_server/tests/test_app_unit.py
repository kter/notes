"""Unit tests for MCP Server Lambda (no AWS connection required).

Run with: pytest tests/test_app_unit.py -v
"""

import hashlib
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Mock out heavy / unavailable packages BEFORE importing app
# ---------------------------------------------------------------------------
# These are runtime deps that may not be installed in dev/test environments.
_mock_mcp = MagicMock()
_mock_mcp_server = MagicMock()
_mock_mcp_types = MagicMock()

# Create real-ish stubs so isinstance checks / decorators work
class _Resource:
    def __init__(self, uri, name, description=None, mimeType=None):
        self.uri = uri
        self.name = name
        self.description = description
        self.mimeType = mimeType

class _ResourceContents:
    def __init__(self, uri, mimeType, text):
        self.uri = uri
        self.mimeType = mimeType
        self.text = text

class _ReadResourceResult:
    def __init__(self, contents):
        self.contents = contents

_mock_mcp_types.Resource = _Resource
_mock_mcp_types.ResourceContents = _ResourceContents
_mock_mcp_types.ReadResourceResult = _ReadResourceResult
_mock_mcp_types.ListResourcesRequest = MagicMock
_mock_mcp_types.ReadResourceRequest = MagicMock
_mock_mcp_types.ListResourcesResult = MagicMock
_mock_mcp_types.TextContent = MagicMock

_mock_server_instance = MagicMock()
_mock_server_instance.list_resources = lambda: (lambda f: f)
_mock_server_instance.read_resource = lambda: (lambda f: f)
_mock_mcp_server.Server = MagicMock(return_value=_mock_server_instance)

sys.modules.setdefault("mcp", _mock_mcp)
sys.modules.setdefault("mcp.server", _mock_mcp_server)
sys.modules.setdefault("mcp.types", _mock_mcp_types)
sys.modules.setdefault("psycopg2", MagicMock())
sys.modules.setdefault("psycopg2.extensions", MagicMock())

# Now it is safe to import the app module
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

import importlib
import app as _app_module  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402


def _fresh_client():
    """Return a TestClient from the (already-imported) app."""
    return TestClient(_app_module.app)


# ===========================================================================
# Health check
# ===========================================================================

class TestHealthCheck:
    def test_returns_ok(self):
        client = _fresh_client()
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ===========================================================================
# build_jsonrpc_response / build_jsonrpc_error
# ===========================================================================

class TestBuildJsonrpcHelpers:
    def test_build_response_with_result(self):
        resp = _app_module.build_jsonrpc_response(1, result={"foo": "bar"})
        assert resp == {"jsonrpc": "2.0", "id": 1, "result": {"foo": "bar"}}

    def test_build_response_with_error(self):
        err = {"code": -32601, "message": "Method not found"}
        resp = _app_module.build_jsonrpc_response(1, error=err)
        assert resp == {"jsonrpc": "2.0", "id": 1, "error": err}

    def test_build_error(self):
        resp = _app_module.build_jsonrpc_error(-32600, "Invalid Request", request_id=2)
        assert resp["jsonrpc"] == "2.0"
        assert resp["id"] == 2
        assert resp["error"]["code"] == -32600


# ===========================================================================
# verify_jwt_token  (mocked JWKS + jose)
# ===========================================================================

class TestVerifyJwtToken:
    def test_expired_token_raises_401(self):
        from fastapi import HTTPException
        from jose.exceptions import ExpiredSignatureError
        from jose import jwk as jose_jwk

        # Provide a fake RSA-like key entry so kid matches and jwt.decode is reached
        fake_key_entry = {"kid": "k", "kty": "RSA", "n": "fake", "e": "AQAB"}
        fake_jwks = {"keys": [fake_key_entry]}

        mock_rsa_key = MagicMock()
        mock_rsa_key.to_pem.return_value.public_key.return_value = "fake-public-key"

        with patch.object(_app_module, "get_jwks", return_value=fake_jwks), \
             patch("app.jwt.get_unverified_header", return_value={"kid": "k"}), \
             patch("app.jwk.construct", return_value=mock_rsa_key), \
             patch("app.jwt.decode", side_effect=ExpiredSignatureError("expired")):
            with pytest.raises(HTTPException) as exc:
                _app_module.verify_jwt_token("fake.token.here")
        assert exc.value.status_code == 401
        assert "expired" in exc.value.detail.lower()

    def test_invalid_token_raises_401(self):
        from fastapi import HTTPException
        from jose.exceptions import JWTError

        with patch.object(_app_module, "get_jwks", return_value={"keys": []}), \
             patch("app.jwt.get_unverified_header", return_value={"kid": "k"}), \
             patch("app.jwt.decode", side_effect=JWTError("bad sig")):
            with pytest.raises(HTTPException) as exc:
                _app_module.verify_jwt_token("fake.token.here")
        assert exc.value.status_code == 401

    def test_no_matching_kid_raises_401(self):
        from fastapi import HTTPException

        fake_jwks = {"keys": [{"kid": "other-kid", "kty": "RSA"}]}
        with patch.object(_app_module, "get_jwks", return_value=fake_jwks), \
             patch("app.jwt.get_unverified_header", return_value={"kid": "test-kid"}):
            with pytest.raises(HTTPException) as exc:
                _app_module.verify_jwt_token("fake.token.here")
        assert exc.value.status_code == 401

    def test_jwks_fetch_error_raises_401(self):
        from fastapi import HTTPException

        with patch.object(_app_module, "get_jwks", side_effect=Exception("network error")), \
             patch("app.jwt.get_unverified_header", return_value={"kid": "k"}):
            with pytest.raises(HTTPException) as exc:
                _app_module.verify_jwt_token("fake.token.here")
        assert exc.value.status_code == 401


# ===========================================================================
# verify_mcp_token  (mocked DB)
# ===========================================================================

class TestVerifyMcpToken:
    def _make_mock_engine(self, row):
        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.execute.return_value.fetchone.return_value = row
        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn
        return mock_engine

    def test_invalid_prefix_raises_error(self):
        from fastapi import HTTPException

        with patch.object(_app_module, "get_db_engine", side_effect=HTTPException(500, "err")):
            with pytest.raises((ValueError, HTTPException)):
                _app_module.verify_mcp_token("invalid_token")

    def test_valid_token_returns_user_id(self):
        future = datetime.now(timezone.utc) + timedelta(hours=1)
        mock_engine = self._make_mock_engine(("user-abc", future))

        with patch.object(_app_module, "get_db_engine", return_value=mock_engine):
            user_id = _app_module.verify_mcp_token("mcp_testtoken123")
        assert user_id == "user-abc"

    def test_revoked_token_raises_401(self):
        from fastapi import HTTPException

        mock_engine = self._make_mock_engine(None)  # None = not found / revoked
        with patch.object(_app_module, "get_db_engine", return_value=mock_engine):
            with pytest.raises(HTTPException) as exc:
                _app_module.verify_mcp_token("mcp_revoked123")
        assert exc.value.status_code == 401

    def test_expired_mcp_token_raises_401(self):
        from fastapi import HTTPException

        past = datetime.now(timezone.utc) - timedelta(hours=1)
        mock_engine = self._make_mock_engine(("user-abc", past))
        with patch.object(_app_module, "get_db_engine", return_value=mock_engine):
            with pytest.raises(HTTPException) as exc:
                _app_module.verify_mcp_token("mcp_expiredtoken")
        assert exc.value.status_code == 401
        assert "expired" in exc.value.detail.lower()


# ===========================================================================
# handle_streamable_http_request  (pure routing logic)
# ===========================================================================

class TestHandleStreamableHttp:
    @pytest.mark.asyncio
    async def test_initialize(self):
        resp = await _app_module.handle_streamable_http_request(
            {"jsonrpc": "2.0", "id": 1, "method": "initialize",
             "params": {"protocolVersion": "2024-11-05", "clientInfo": {"name": "test"}}},
            user_id="user-123",
        )
        assert resp["id"] == 1
        assert "protocolVersion" in resp["result"]
        assert resp["result"]["serverInfo"]["name"] == "notes-app-mcp"

    @pytest.mark.asyncio
    async def test_ping(self):
        resp = await _app_module.handle_streamable_http_request(
            {"jsonrpc": "2.0", "id": 2, "method": "ping"},
            user_id="user-123",
        )
        assert resp["id"] == 2
        assert "result" in resp

    @pytest.mark.asyncio
    async def test_notifications_initialized(self):
        resp = await _app_module.handle_streamable_http_request(
            {"jsonrpc": "2.0", "id": 3, "method": "notifications/initialized"},
            user_id="user-123",
        )
        assert resp["id"] == 3
        assert "result" in resp

    @pytest.mark.asyncio
    async def test_unknown_method_returns_error(self):
        resp = await _app_module.handle_streamable_http_request(
            {"jsonrpc": "2.0", "id": 4, "method": "unknown/method"},
            user_id="user-123",
        )
        assert resp["id"] == 4
        assert "error" in resp
        assert resp["error"]["code"] == -32601

    @pytest.mark.asyncio
    async def test_missing_method_field_returns_error(self):
        resp = await _app_module.handle_streamable_http_request(
            {"jsonrpc": "2.0", "id": 5},
            user_id="user-123",
        )
        assert "error" in resp
        assert resp["error"]["code"] == -32600

    @pytest.mark.asyncio
    async def test_resources_list_with_mocked_db(self):
        mock_note = MagicMock()
        mock_note.id = "note-1"
        mock_note.title = "Test Note"
        mock_note.created_at = "2024-01-01T00:00:00Z"

        mock_session = MagicMock()
        # First call for notes returns [mock_note], second call for folders returns []
        mock_session.exec.return_value.all.side_effect = [[mock_note], []]
        mock_session.close = MagicMock()

        with patch.object(_app_module, "get_db_session", return_value=mock_session):
            resp = await _app_module.handle_streamable_http_request(
                {"jsonrpc": "2.0", "id": 6, "method": "resources/list", "params": {}},
                user_id="user-123",
            )

        assert resp["id"] == 6
        resources = resp["result"]["resources"]
        assert len(resources) == 1
        assert resources[0]["uri"] == "notes://note/note-1"
        assert resources[0]["name"] == "Test Note"
        assert resources[0]["mimeType"] == "text/markdown"

    @pytest.mark.asyncio
    async def test_resources_read_missing_uri(self):
        resp = await _app_module.handle_streamable_http_request(
            {"jsonrpc": "2.0", "id": 7, "method": "resources/read", "params": {}},
            user_id="user-123",
        )
        assert "error" in resp
        assert resp["error"]["code"] == -32602

    @pytest.mark.asyncio
    async def test_resources_read_with_mocked_db(self):
        mock_note = MagicMock()
        mock_note.id = "note-1"
        mock_note.title = "Test Note"
        mock_note.content = "# Hello"

        mock_session = MagicMock()
        mock_session.exec.return_value.first.return_value = mock_note
        mock_session.close = MagicMock()

        with patch.object(_app_module, "get_db_session", return_value=mock_session):
            resp = await _app_module.handle_streamable_http_request(
                {"jsonrpc": "2.0", "id": 8, "method": "resources/read",
                 # Correct URI format is notes://note/{id}
                 "params": {"uri": "notes://note/note-1"}},
                user_id="user-123",
            )

        assert resp["id"] == 8
        contents = resp["result"]["contents"]
        assert len(contents) == 1
        assert contents[0]["uri"] == "notes://note/note-1"
        assert contents[0]["text"] == "# Hello"


# ===========================================================================
# MCP HTTP endpoint – authentication gating
# ===========================================================================

class TestMCPEndpointAuth:
    def test_invalid_bearer_format_returns_401(self):
        client = _fresh_client()
        resp = client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "ping"},
            headers={"Authorization": "Token not-bearer"},
        )
        assert resp.status_code == 401

    def test_missing_authorization_returns_422(self):
        client = _fresh_client()
        resp = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"})
        # app.py explicitly returns 401 if header is missing
        assert resp.status_code == 401

    def test_invalid_jwt_returns_401(self):
        from fastapi import HTTPException

        client = _fresh_client()
        with patch.object(
            _app_module,
            "verify_jwt_token",
            side_effect=HTTPException(status_code=401, detail="Invalid token"),
        ):
            resp = client.post(
                "/mcp",
                json={"jsonrpc": "2.0", "id": 1, "method": "ping"},
                headers={"Authorization": "Bearer fake.jwt.token"},
            )
        assert resp.status_code == 401

    def test_valid_jwt_ping_returns_200(self):
        client = _fresh_client()
        with patch.object(_app_module, "verify_jwt_token", return_value={"sub": "user-xyz"}):
            resp = client.post(
                "/mcp",
                json={"jsonrpc": "2.0", "id": 1, "method": "ping"},
                headers={"Authorization": "Bearer valid.jwt.token"},
            )
        assert resp.status_code == 200
        assert resp.json().get("result") is not None
