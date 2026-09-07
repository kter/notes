"""FastAPI 依存性注入による認証・認可ヘルパーモジュール。

責務: Bearer トークンおよび API キーを検証し、認証済みユーザー情報を返す。
    ルートが受け付ける資格情報の種類は require_principal の引数として宣言する。
主要なエクスポート: get_current_user, get_current_app_user, require_admin,
    require_principal, および各種型エイリアス。
呼び出し関係: ルーターの Depends から呼ばれ、CognitoJWTVerifier / UserApiKeyService
    / AppUserService を呼ぶ。
"""

import logging
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.auth.api_key_service import UserApiKeyService
from app.auth.app_user_service import AppUserService
from app.auth.cognito import CognitoJWTVerifier, get_cognito_verifier
from app.auth.principal import Credential, Principal
from app.database import get_session
from app.logging_utils import bind_user_id, log_event
from app.models import AppUser
from app.observability import set_sentry_user_context

# Bearer トークンのセキュリティスキーム（必須 / 任意 の2種類を定義）
security = HTTPBearer()
optional_bearer_security = HTTPBearer(auto_error=False)
api_key_header_security = APIKeyHeader(name="X-API-Key", auto_error=False)
logger = logging.getLogger(__name__)


async def _verify_bearer_token(
    token: str, verifier: CognitoJWTVerifier | None = None
) -> dict:
    """Bearer トークンを検証してクレームを返す内部ヘルパー。

    検証成功時はログコンテキストと Sentry にユーザー ID を設定する。

    Raises:
        HTTPException: トークン検証失敗時に 401 を送出する。
    """
    try:
        verifier = verifier if verifier is not None else get_cognito_verifier()
        claims = await verifier.verify_token(token)
        user_id = claims.get("sub", "")
        if user_id:
            bind_user_id(user_id)
            set_sentry_user_context(user_id)
        log_event(
            logger,
            logging.INFO,
            "security.auth.authenticated",
            outcome="success",
        )
        return claims
    except jwt.PyJWTError as exc:
        log_event(
            logger,
            logging.WARNING,
            "security.auth.failed",
            outcome="failure",
            reason=exc.__class__.__name__,
            exc_info=exc,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> dict:
    """現在の認証済みユーザーのクレームを返す FastAPI 依存関数。

    Args:
        credentials: Authorization ヘッダーから取得した Bearer トークン。

    Returns:
        デコードされた JWT クレーム辞書。

    Raises:
        HTTPException: 認証失敗時に 401 を送出する。
    """
    return await _verify_bearer_token(credentials.credentials)


def _app_user_from_claims(claims: dict, session: Session) -> AppUser:
    """検証済みクレームからアプリローカルのユーザープロファイルを取得・作成する。

    sub クレームが空の場合は 401 を送出する。Bearer で認証するすべての経路が
    ここを通る。以前は API キー併用の依存関数がこの連鎖を手で書き直しており、
    その経路にだけ sub 欠落の 401 が無かった。
    """
    user_id = claims.get("sub", "")
    if not user_id:
        log_event(
            logger,
            logging.WARNING,
            "security.auth.failed",
            outcome="failure",
            reason="missing_user_subject",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing user subject",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AppUserService(session).ensure_app_user(claims)


def get_current_app_user(
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> AppUser:
    """JWT クレームからアプリローカルのユーザープロファイルを取得・作成する。"""
    return _app_user_from_claims(current_user, session)


def get_user_id(app_user: Annotated[AppUser, Depends(get_current_app_user)]) -> str:
    """アプリローカルユーザープロファイルからユーザー ID (sub) を取り出す。"""
    return app_user.user_id


def require_admin(
    app_user: Annotated[AppUser, Depends(get_current_app_user)],
) -> AppUser:
    """管理者権限を要求する依存関数。権限がない場合は 403 を送出する。"""
    if not app_user.admin:
        log_event(
            logger,
            logging.WARNING,
            "security.authorization.denied",
            outcome="failure",
            reason="admin_required",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return app_user


def _principal_from_api_key(api_key: str, session: Session) -> Principal:
    """X-API-Key を検証して Principal を返す。無効なキーは 401。"""
    stored_key = UserApiKeyService(session).authenticate(api_key)
    if stored_key is None:
        log_event(
            logger,
            logging.WARNING,
            "security.auth.failed",
            outcome="failure",
            reason="invalid_api_key",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    bind_user_id(stored_key.user_id)
    set_sentry_user_context(stored_key.user_id)
    log_event(
        logger,
        logging.INFO,
        "security.auth.api_key_authenticated",
        outcome="success",
        api_key_id=stored_key.id,
    )
    return Principal(user_id=stored_key.user_id, credential="api_key")


def require_principal(*allowed: Credential):
    """指定した資格情報で認証された Principal を返す依存関数を組み立てる。

    ルートが受け付ける資格情報の種類を、型エイリアスの名前ではなく引数として
    宣言する。以前は `UserId` と `FolderNoteUserId` という 2 つのエイリアスが
    どちらも str に解決され、後者だけが X-API-Key を受け付けていた。名前が
    示していたのは「今どのルートで使われているか」であって能力ではなく、
    新しいエンドポイントの作者は補完で選ぶだけで認証面を決めていた。
    """
    if "api_key" in allowed:

        async def dependency(
            bearer_credentials: Annotated[
                HTTPAuthorizationCredentials | None,
                Security(optional_bearer_security),
            ],
            api_key: Annotated[str | None, Security(api_key_header_security)],
            session: Annotated[Session, Depends(get_session)],
        ) -> Principal:
            if bearer_credentials is not None:
                claims = await _verify_bearer_token(bearer_credentials.credentials)
                app_user = _app_user_from_claims(claims, session)
                return Principal(user_id=app_user.user_id, credential="bearer")

            if api_key is not None:
                return _principal_from_api_key(api_key, session)

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return dependency

    async def bearer_only_dependency(
        credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
        session: Annotated[Session, Depends(get_session)],
    ) -> Principal:
        claims = await _verify_bearer_token(credentials.credentials)
        app_user = _app_user_from_claims(claims, session)
        return Principal(user_id=app_user.user_id, credential="bearer")

    return bearer_only_dependency


async def get_bearer_or_api_key_user_id(
    principal: Annotated[Principal, Depends(require_principal("bearer", "api_key"))],
) -> str:
    """Bearer または X-API-Key で認証されたユーザー ID を返す。"""
    return principal.user_id


# 依存性注入で使用する型エイリアス
CurrentUser = Annotated[dict, Depends(get_current_user)]
CurrentAppUser = Annotated[AppUser, Depends(get_current_app_user)]
AdminUser = Annotated[AppUser, Depends(require_admin)]
# Bearer のみ。API キーでは通らない。
UserId = Annotated[str, Depends(get_user_id)]
# Bearer に加えて X-API-Key も受け付ける。外部連携向けに開いている面。
BearerOrApiKeyUserId = Annotated[str, Depends(get_bearer_or_api_key_user_id)]
