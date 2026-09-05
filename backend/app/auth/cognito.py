"""Amazon Cognito JWT トークンの検証モジュール。

責務: Cognito が発行した JWT をオンライン検証し、クレームを返す。
主要なエクスポート: CognitoJWTVerifier、get_cognito_verifier。
呼び出し関係: app.auth.dependencies から呼ばれ、httpx / PyJWT を呼ぶ。
"""

import asyncio
import secrets
import time

import httpx
import jwt

from app.config import get_settings

JWKS_CACHE_TTL_SECONDS = 3600


class CognitoJWTVerifier:
    """Cognito JWT トークンを検証するクラス。

    JWKS をオンデマンドで取得してキャッシュし、RS256 署名を検証する。
    """

    def __init__(self):
        settings = get_settings()
        self.region = settings.cognito_region
        self.user_pool_id = settings.cognito_user_pool_id
        self.app_client_id = settings.cognito_app_client_id
        self._jwks = None  # 初回取得後にメモリキャッシュする
        self._jwks_fetched_at: float = 0.0
        self._jwks_refetch_lock = asyncio.Lock()
        self._jwks_url = (
            f"https://cognito-idp.{self.region}.amazonaws.com/"
            f"{self.user_pool_id}/.well-known/jwks.json"
        )

    async def _get_jwks(self, *, force_refresh: bool = False) -> dict:
        """Cognito から JWKS を取得してキャッシュする。

        TTL (JWKS_CACHE_TTL_SECONDS) を超えた場合は再取得する。
        """
        now = time.monotonic()
        if (
            force_refresh
            or self._jwks is None
            or (now - self._jwks_fetched_at) > JWKS_CACHE_TTL_SECONDS
        ):
            async with httpx.AsyncClient() as client:
                response = await client.get(self._jwks_url)
                response.raise_for_status()
                self._jwks = response.json()
                self._jwks_fetched_at = now
        return self._jwks

    def _get_signing_key(self, token: str, jwks: dict) -> object | None:
        """トークンヘッダーの kid に対応する署名キーを JWKS から取得する。

        一致するキーが見つからない場合は None を返す。
        """
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                return jwt.PyJWK(key).key
        return None

    async def verify_token(self, token: str) -> dict:
        """Cognito JWT トークンを検証してクレームを返す。

        Args:
            token: 検証対象の JWT 文字列。

        Returns:
            デコードされたトークンクレーム辞書。

        Raises:
            jwt.PyJWTError: 署名検証失敗・有効期限切れ・不正なトークン形式の場合。
        """
        settings = get_settings()
        # ----------------------------------------------------------------------
        # 開発環境での結合テスト用バイパス
        #
        # トークンはソースにハードコードせず、デプロイ時に環境変数
        # (INTEGRATION_TEST_BYPASS_TOKEN) として注入された秘密値とのみ照合する。
        # 環境変数が未設定（本番および注入されていない環境）の場合はバイパスを
        # 一切行わず、通常の JWT 検証にフォールスルーする。
        # ----------------------------------------------------------------------
        if settings.environment == "dev" and settings.integration_test_bypass_token:
            if secrets.compare_digest(token, settings.integration_test_bypass_token):
                return {
                    "sub": "integration-test-user-id",
                    "username": "integration-test-user",
                    "email": "integration-test-user@example.com",
                    "token_use": "id",
                    "scope": "aws.cognito.signin.user.admin",
                }
            if settings.integration_test_bypass_token_2 and secrets.compare_digest(
                token, settings.integration_test_bypass_token_2
            ):
                return {
                    "sub": "integration-test-user-id-2",
                    "username": "integration-test-user-2",
                    "email": "integration-test-user-2@example.com",
                    "token_use": "id",
                    "scope": "aws.cognito.signin.user.admin",
                }

        if settings.environment == "local" and secrets.compare_digest(
            token,
            "local-dev-token",  # noqa: S105
        ):
            return {
                "sub": "local-dev-user-id",
                "username": "local-dev-user",
                "email": "local-dev-user@example.com",
                "token_use": "id",
                "scope": "aws.cognito.signin.user.admin",
            }

        jwks = await self._get_jwks()
        signing_key = self._get_signing_key(token, jwks)

        if signing_key is None:
            async with self._jwks_refetch_lock:
                # 別リクエストが待機中に再取得済みなら、その結果を再利用する。
                if self._jwks is jwks:
                    jwks = await self._get_jwks(force_refresh=True)
                else:
                    jwks = self._jwks
                signing_key = self._get_signing_key(token, jwks)

        if signing_key is None:
            raise jwt.PyJWTError("Unable to find signing key")

        try:
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=["RS256"],
                audience=self.app_client_id,
                issuer=f"https://cognito-idp.{self.region}.amazonaws.com/{self.user_pool_id}",
                options={"require": ["exp", "iat", "iss", "aud", "sub", "token_use"]},
            )
            if claims.get("token_use") != "id":
                raise jwt.InvalidTokenError("token_use must be id")
            return claims
        except jwt.ExpiredSignatureError:
            # 有効期限切れは専用のエラーメッセージに統一する
            raise jwt.PyJWTError("Token has expired")
        except jwt.PyJWTError as e:
            raise jwt.PyJWTError(f"Token verification failed: {e}")


_cognito_verifier: CognitoJWTVerifier | None = None


def get_cognito_verifier() -> CognitoJWTVerifier:
    """初回利用時に生成したCognito検証器のシングルトンを返す。"""
    global _cognito_verifier
    if _cognito_verifier is None:
        _cognito_verifier = CognitoJWTVerifier()
    return _cognito_verifier


def _reset_cognito_verifier_cache() -> None:
    """テスト向けにCognito検証器のキャッシュを破棄する。"""
    global _cognito_verifier
    _cognito_verifier = None
