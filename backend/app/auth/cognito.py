import httpx
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

from app.config import get_settings

settings = get_settings()


class CognitoJWTVerifier:
    """Verify Cognito JWT tokens."""

    def __init__(self):
        self.region = settings.cognito_region
        self.user_pool_id = settings.cognito_user_pool_id
        self.app_client_id = settings.cognito_app_client_id
        self._jwks = None
        self._jwks_url = (
            f"https://cognito-idp.{self.region}.amazonaws.com/"
            f"{self.user_pool_id}/.well-known/jwks.json"
        )

    async def _get_jwks(self) -> dict:
        """Fetch JWKS from Cognito."""
        if self._jwks is None:
            async with httpx.AsyncClient() as client:
                response = await client.get(self._jwks_url)
                response.raise_for_status()
                self._jwks = response.json()
        return self._jwks

    def _get_signing_key(self, token: str, jwks: dict) -> dict | None:
        """Get the signing key for a token from JWKS."""
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                return key
        return None

    async def verify_token(self, token: str) -> dict:
        """
        Verify a Cognito JWT token and return the claims.

        Args:
            token: The JWT token string

        Returns:
            The decoded token claims

        Raises:
            JWTError: If token verification fails
        """
        # ----------------------------------------------------------------------
        # BYPASS FOR INTEGRATION TESTING IN DEV ENVIRONMENT
        # ----------------------------------------------------------------------
        if settings.environment == "dev" and token == "dev-integration-test-token":
            return {
                "sub": "integration-test-user-id",
                "username": "integration-test-user",
                "token_use": "access",
                "scope": "aws.cognito.signin.user.admin",
            }

        jwks = await self._get_jwks()
        signing_key = self._get_signing_key(token, jwks)

        if signing_key is None:
            raise JWTError("Unable to find signing key")

        try:
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=["RS256"],
                audience=self.app_client_id,
                issuer=f"https://cognito-idp.{self.region}.amazonaws.com/{self.user_pool_id}",
            )
            return claims
        except ExpiredSignatureError:
            raise JWTError("Token has expired")
        except JWTError as e:
            raise JWTError(f"Token verification failed: {e}")


# Singleton instance
cognito_verifier = CognitoJWTVerifier()
