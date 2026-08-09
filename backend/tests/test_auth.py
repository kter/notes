import asyncio
import time
from unittest import mock
from unittest.mock import Mock, patch

import jwt
import pytest
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from app.auth.cognito import CognitoJWTVerifier
from app.auth.dependencies import _verify_bearer_token


def _generate_rsa_key_pair(kid="test-key-id"):
    """テスト用の RSA 秘密鍵と対応する公開 JWK を生成する。"""
    private_key = rsa.generate_private_key(
        public_exponent=65537, key_size=2048, backend=default_backend()
    )
    public_key = private_key.public_key()

    # 公開鍵の数値から PyJWT が読み込める JWK を組み立てる。
    public_numbers = public_key.public_numbers()

    # helper to encode int to url safe base64
    def int_to_b64(val):
        import base64

        # Convert integer to bytes, big endian
        byte_len = (val.bit_length() + 7) // 8
        val_bytes = val.to_bytes(byte_len, "big")
        return base64.urlsafe_b64encode(val_bytes).decode("utf-8").rstrip("=")

    jwk_public = {
        "kty": "RSA",
        "n": int_to_b64(public_numbers.n),
        "e": int_to_b64(public_numbers.e),
        "kid": kid,
        "alg": "RS256",
        "use": "sig",
    }

    return private_key, jwk_public


@pytest.fixture(scope="module")
def rsa_key_pair():
    return _generate_rsa_key_pair()


@pytest.fixture
def mock_settings():
    with patch("app.auth.cognito.settings") as mock_settings:
        mock_settings.cognito_region = "us-east-1"
        mock_settings.cognito_user_pool_id = "us-east-1_testpool"
        mock_settings.cognito_app_client_id = "test-client-id"
        mock_settings.environment = "prd"
        mock_settings.integration_test_bypass_token = ""
        mock_settings.integration_test_bypass_token_2 = ""
        yield mock_settings


@pytest.mark.asyncio
async def test_verify_token_success(rsa_key_pair, mock_settings):
    private_key, public_jwk = rsa_key_pair
    verifier = CognitoJWTVerifier()

    # Mock JWKS response
    jwks = {"keys": [public_jwk]}

    # Create a valid token
    headers = {"kid": "test-key-id"}
    claims = {
        "sub": "test-user-123",
        "iss": f"https://cognito-idp.{mock_settings.cognito_region}.amazonaws.com/{mock_settings.cognito_user_pool_id}",
        "aud": mock_settings.cognito_app_client_id,
        "exp": int(time.time()) + 3600,  # 1 hour future
        "iat": int(time.time()),
        "token_use": "id",
    }

    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    token = jwt.encode(claims, pem_private, algorithm="RS256", headers=headers)

    # Mock the HTTP call
    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None

        mock_response = Mock()
        mock_response.json.return_value = jwks
        mock_response.raise_for_status.return_value = None

        # Ensure get is awaitable
        mock_instance.get = mock.AsyncMock(return_value=mock_response)

        # Verify
        decoded = await verifier.verify_token(token)

        assert decoded["sub"] == "test-user-123"
        assert decoded["aud"] == mock_settings.cognito_app_client_id


@pytest.mark.asyncio
async def test_verify_token_rejects_non_id_token(rsa_key_pair, mock_settings):
    private_key, public_jwk = rsa_key_pair
    verifier = CognitoJWTVerifier()
    now = int(time.time())
    claims = {
        "sub": "test-user-123",
        "iss": f"https://cognito-idp.{mock_settings.cognito_region}.amazonaws.com/{mock_settings.cognito_user_pool_id}",
        "aud": mock_settings.cognito_app_client_id,
        "exp": now + 3600,
        "iat": now,
        "token_use": "access",
    }
    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    token = jwt.encode(
        claims,
        pem_private,
        algorithm="RS256",
        headers={"kid": "test-key-id"},
    )

    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None
        mock_response = Mock()
        mock_response.json.return_value = {"keys": [public_jwk]}
        mock_response.raise_for_status.return_value = None
        mock_instance.get = mock.AsyncMock(return_value=mock_response)

        with pytest.raises(jwt.PyJWTError, match="token_use must be id"):
            await verifier.verify_token(token)


@pytest.mark.asyncio
async def test_bearer_dependency_maps_pyjwt_error_to_401():
    with patch(
        "app.auth.dependencies.cognito_verifier.verify_token",
        new=mock.AsyncMock(side_effect=jwt.PyJWTError("invalid token")),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await _verify_bearer_token("invalid-token")

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid or expired token"


@pytest.mark.asyncio
async def test_verify_token_expired(rsa_key_pair, mock_settings):
    private_key, public_jwk = rsa_key_pair
    verifier = CognitoJWTVerifier()

    # Mock JWKS response
    jwks = {"keys": [public_jwk]}

    # Create an expired token
    headers = {"kid": "test-key-id"}
    claims = {
        "sub": "test-user-123",
        "iss": f"https://cognito-idp.{mock_settings.cognito_region}.amazonaws.com/{mock_settings.cognito_user_pool_id}",
        "aud": mock_settings.cognito_app_client_id,
        "exp": int(time.time()) - 3600,  # 1 hour past
        "iat": int(time.time()) - 7200,
        "token_use": "id",
    }

    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    token = jwt.encode(claims, pem_private, algorithm="RS256", headers=headers)

    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None

        mock_response = Mock()
        mock_response.json.return_value = jwks

        mock_instance.get = mock.AsyncMock(return_value=mock_response)

        # Verify raises error
        with pytest.raises(jwt.PyJWTError, match="Token has expired"):
            await verifier.verify_token(token)


@pytest.mark.asyncio
async def test_verify_token_invalid_kid(rsa_key_pair, mock_settings):
    private_key, public_jwk = rsa_key_pair
    verifier = CognitoJWTVerifier()

    # Mock JWKS response
    jwks = {"keys": [public_jwk]}

    # Token with unknown KID
    headers = {"kid": "unknown-key-id"}
    claims = {"sub": "test-user"}

    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    token = jwt.encode(claims, pem_private, algorithm="RS256", headers=headers)

    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None

        mock_response = Mock()
        mock_response.json.return_value = jwks

        mock_instance.get = mock.AsyncMock(return_value=mock_response)

        with pytest.raises(jwt.PyJWTError, match="Unable to find signing key"):
            await verifier.verify_token(token)
        assert mock_instance.get.call_count == 2


@pytest.mark.asyncio
async def test_kid_miss_refetches_once_and_uses_rotated_key(
    rsa_key_pair, mock_settings
):
    _, old_public_jwk = rsa_key_pair
    new_private_key, new_public_jwk = _generate_rsa_key_pair("rotated-key-id")
    verifier = CognitoJWTVerifier()
    now = int(time.time())
    claims = {
        "sub": "test-user-rotated",
        "iss": f"https://cognito-idp.{mock_settings.cognito_region}.amazonaws.com/{mock_settings.cognito_user_pool_id}",
        "aud": mock_settings.cognito_app_client_id,
        "exp": now + 3600,
        "iat": now,
        "token_use": "id",
    }
    pem_private = new_private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    token = jwt.encode(
        claims,
        pem_private,
        algorithm="RS256",
        headers={"kid": "rotated-key-id"},
    )

    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None
        mock_response = Mock()
        mock_response.json.side_effect = [
            {"keys": [old_public_jwk]},
            {"keys": [new_public_jwk]},
        ]
        mock_response.raise_for_status.return_value = None
        mock_instance.get = mock.AsyncMock(return_value=mock_response)

        decoded = await verifier.verify_token(token)

        assert decoded["sub"] == "test-user-rotated"
        assert mock_instance.get.call_count == 2


@pytest.mark.asyncio
async def test_concurrent_kid_misses_share_one_refetch(rsa_key_pair, mock_settings):
    private_key, public_jwk = rsa_key_pair
    verifier = CognitoJWTVerifier()
    verifier._jwks = {"keys": [public_jwk]}
    verifier._jwks_fetched_at = time.monotonic()
    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    token = jwt.encode(
        {"sub": "test-user"},
        pem_private,
        algorithm="RS256",
        headers={"kid": "unknown-key-id"},
    )

    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None
        mock_response = Mock()
        mock_response.json.return_value = {"keys": [public_jwk]}
        mock_response.raise_for_status.return_value = None

        async def delayed_get(*_args, **_kwargs):
            await asyncio.sleep(0)
            return mock_response

        mock_instance.get = mock.AsyncMock(side_effect=delayed_get)

        results = await asyncio.gather(
            *(verifier.verify_token(token) for _ in range(5)),
            return_exceptions=True,
        )

        assert all(isinstance(result, jwt.PyJWTError) for result in results)
        assert mock_instance.get.call_count == 1


@pytest.mark.asyncio
async def test_local_dev_token_bypass_in_local(mock_settings):
    mock_settings.environment = "local"
    verifier = CognitoJWTVerifier()
    result = await verifier.verify_token("local-dev-token")
    assert result["sub"] == "local-dev-user-id"
    assert result["email"] == "local-dev-user@example.com"
    assert result["token_use"] == "id"


@pytest.mark.asyncio
async def test_local_dev_token_blocked_in_dev(mock_settings):
    """local-dev-token must NOT work in dev: dev shares the production DSQL cluster."""
    mock_settings.environment = "dev"
    verifier = CognitoJWTVerifier()
    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None
        mock_response = Mock()
        mock_response.json.return_value = {"keys": []}
        mock_response.raise_for_status.return_value = None
        mock_instance.get = mock.AsyncMock(return_value=mock_response)
        with pytest.raises(jwt.PyJWTError):
            await verifier.verify_token("local-dev-token")


@pytest.mark.asyncio
async def test_local_dev_token_blocked_in_prd(mock_settings):
    mock_settings.environment = "prd"
    verifier = CognitoJWTVerifier()
    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None
        mock_response = Mock()
        mock_response.json.return_value = {"keys": []}
        mock_response.raise_for_status.return_value = None
        mock_instance.get = mock.AsyncMock(return_value=mock_response)
        with pytest.raises(jwt.PyJWTError):
            await verifier.verify_token("local-dev-token")


@pytest.mark.asyncio
async def test_dev_integration_token_blocked_in_local(mock_settings):
    mock_settings.environment = "local"
    mock_settings.integration_test_bypass_token = "dev-integration-test-token"
    verifier = CognitoJWTVerifier()
    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None
        mock_response = Mock()
        mock_response.json.return_value = {"keys": []}
        mock_response.raise_for_status.return_value = None
        mock_instance.get = mock.AsyncMock(return_value=mock_response)
        with pytest.raises(jwt.PyJWTError):
            await verifier.verify_token("dev-integration-test-token")


@pytest.mark.asyncio
async def test_dev_integration_token_bypass_in_dev(mock_settings):
    mock_settings.environment = "dev"
    mock_settings.integration_test_bypass_token = "injected-secret-token"
    mock_settings.integration_test_bypass_token_2 = "injected-secret-token-2"
    verifier = CognitoJWTVerifier()
    result = await verifier.verify_token("injected-secret-token")
    assert result["sub"] == "integration-test-user-id"
    assert result["token_use"] == "id"
    result2 = await verifier.verify_token("injected-secret-token-2")
    assert result2["sub"] == "integration-test-user-id-2"
    assert result2["token_use"] == "id"


@pytest.mark.asyncio
async def test_bypass_disabled_when_token_unset_in_dev(mock_settings):
    """バイパストークンが未設定なら、dev でも結合テストトークンは通常検証され拒否される。

    これがセキュリティ修正の要: ソースにハードコードされた推測可能トークンを廃し、
    デプロイ時に注入された秘密値が無い限りバイパスは成立しない。
    """
    mock_settings.environment = "dev"
    mock_settings.integration_test_bypass_token = ""
    mock_settings.integration_test_bypass_token_2 = ""
    verifier = CognitoJWTVerifier()
    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None
        mock_response = Mock()
        mock_response.json.return_value = {"keys": []}
        mock_response.raise_for_status.return_value = None
        mock_instance.get = mock.AsyncMock(return_value=mock_response)
        # かつての推測可能トークンはもはやバイパスされず、署名検証で失敗する
        with pytest.raises(jwt.PyJWTError):
            await verifier.verify_token("dev-integration-test-token")


@pytest.mark.asyncio
async def test_bypass_rejects_wrong_token_in_dev(mock_settings):
    """バイパストークンが設定されていても、一致しないトークンは通常検証へ回す。"""
    mock_settings.environment = "dev"
    mock_settings.integration_test_bypass_token = "injected-secret-token"
    mock_settings.integration_test_bypass_token_2 = ""
    verifier = CognitoJWTVerifier()
    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None
        mock_response = Mock()
        mock_response.json.return_value = {"keys": []}
        mock_response.raise_for_status.return_value = None
        mock_instance.get = mock.AsyncMock(return_value=mock_response)
        with pytest.raises(jwt.PyJWTError):
            await verifier.verify_token("dev-integration-test-token")


@pytest.mark.asyncio
async def test_jwks_caching(rsa_key_pair, mock_settings):
    _, public_jwk = rsa_key_pair
    verifier = CognitoJWTVerifier()
    jwks = {"keys": [public_jwk]}

    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None

        mock_response = Mock()
        mock_response.json.return_value = jwks

        mock_instance.get = mock.AsyncMock(return_value=mock_response)

        # First call triggers fetch
        await verifier._get_jwks()
        assert mock_instance.get.call_count == 1

        # Second call should use cache
        await verifier._get_jwks()
        assert mock_instance.get.call_count == 1
