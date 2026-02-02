import time
from unittest import mock
from unittest.mock import Mock, patch

import pytest
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt

from app.auth.cognito import CognitoJWTVerifier, JWTError


# Helper to generate RSA keys for testing
@pytest.fixture(scope="module")
def rsa_key_pair():
    private_key = rsa.generate_private_key(
        public_exponent=65537, key_size=2048, backend=default_backend()
    )
    public_key = private_key.public_key()
    
    # Export public key to JWK format manually as python-jose doesn't have a direct "export public key to dict" easily accessible without some internals
    # But we can use the numbers.
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
        "kid": "test-key-id",
        "alg": "RS256",
        "use": "sig"
    }
    
    return private_key, jwk_public

@pytest.fixture
def mock_settings():
    with patch("app.auth.cognito.settings") as mock_settings:
        mock_settings.cognito_region = "us-east-1"
        mock_settings.cognito_user_pool_id = "us-east-1_testpool"
        mock_settings.cognito_app_client_id = "test-client-id"
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
        "token_use": "access"
    }
    
    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
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
async def test_verify_token_expired(rsa_key_pair, mock_settings):
    private_key, public_jwk = rsa_key_pair
    verifier = CognitoJWTVerifier()
    
    # Mock JWKS response
    jwks = {"keys": [public_jwk]}
    
    # Create an expired token
    headers = {"kid": "test-key-id"}
    claims = {
        "sub": "test-user-123",
        "iss": "test-issuer",
        "aud": "test-client",
        "exp": int(time.time()) - 3600,  # 1 hour past
    }
    
    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
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
        with pytest.raises(JWTError, match="Token has expired"):
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
        encryption_algorithm=serialization.NoEncryption()
    )
    token = jwt.encode(claims, pem_private, algorithm="RS256", headers=headers)

    with patch("httpx.AsyncClient", autospec=True) as MockClient:
        mock_instance = MockClient.return_value
        mock_instance.__aenter__.return_value = mock_instance
        mock_instance.__aexit__.return_value = None
        
        mock_response = Mock()
        mock_response.json.return_value = jwks
        
        mock_instance.get = mock.AsyncMock(return_value=mock_response)
        
        with pytest.raises(JWTError, match="Unable to find signing key"):
            await verifier.verify_token(token)

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
