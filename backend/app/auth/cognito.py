"""Amazon Cognito JWT トークンの検証モジュール。

責務: Cognito が発行した JWT をオンライン検証し、クレームを返す。
主要なエクスポート: CognitoJWTVerifier クラス、cognito_verifier シングルトン。
呼び出し関係: app.auth.dependencies から呼ばれ、httpx / python-jose を呼ぶ。
"""

import httpx
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

from app.config import get_settings

settings = get_settings()


class CognitoJWTVerifier:
    """Cognito JWT トークンを検証するクラス。

    JWKS をオンデマンドで取得してキャッシュし、RS256 署名を検証する。
    """

    def __init__(self):
        self.region = settings.cognito_region
        self.user_pool_id = settings.cognito_user_pool_id
        self.app_client_id = settings.cognito_app_client_id
        self._jwks = None  # 初回取得後にメモリキャッシュする
        self._jwks_url = (
            f"https://cognito-idp.{self.region}.amazonaws.com/"
            f"{self.user_pool_id}/.well-known/jwks.json"
        )

    async def _get_jwks(self) -> dict:
        """Cognito から JWKS を取得してキャッシュする。

        一度取得した JWKS はインスタンス変数に保持し、再リクエストを省く。
        """
        if self._jwks is None:
            async with httpx.AsyncClient() as client:
                response = await client.get(self._jwks_url)
                response.raise_for_status()
                self._jwks = response.json()
        return self._jwks

    def _get_signing_key(self, token: str, jwks: dict) -> dict | None:
        """トークンヘッダーの kid に対応する署名キーを JWKS から取得する。

        一致するキーが見つからない場合は None を返す。
        """
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                return key
        return None

    async def verify_token(self, token: str) -> dict:
        """Cognito JWT トークンを検証してクレームを返す。

        Args:
            token: 検証対象の JWT 文字列。

        Returns:
            デコードされたトークンクレーム辞書。

        Raises:
            JWTError: 署名検証失敗・有効期限切れ・不正なトークン形式の場合。
        """
        # ----------------------------------------------------------------------
        # 開発環境での結合テスト用バイパス
        # ----------------------------------------------------------------------
        if settings.environment == "dev" and token == "dev-integration-test-token":  # noqa: S105
            return {
                "sub": "integration-test-user-id",
                "username": "integration-test-user",
                "email": "integration-test-user@example.com",
                "token_use": "access",
                "scope": "aws.cognito.signin.user.admin",
            }

        if settings.environment == "dev" and token == "dev-integration-test-token-2":  # noqa: S105
            return {
                "sub": "integration-test-user-id-2",
                "username": "integration-test-user-2",
                "email": "integration-test-user-2@example.com",
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
            # 有効期限切れは専用のエラーメッセージに統一する
            raise JWTError("Token has expired")
        except JWTError as e:
            raise JWTError(f"Token verification failed: {e}")


# モジュールレベルのシングルトン（アプリ全体で JWKS キャッシュを共有する）
cognito_verifier = CognitoJWTVerifier()
