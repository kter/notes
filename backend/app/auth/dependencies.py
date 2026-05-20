"""FastAPI 依存性注入による認証・認可ヘルパーモジュール。

責務: Bearer トークンおよび API キーを検証し、認証済みユーザー情報を返す。
主要なエクスポート: get_current_user, get_current_app_user, require_admin,
    get_folder_note_user_id, および各種型エイリアス。
呼び出し関係: ルーターの Depends から呼ばれ、cognito_verifier / UserApiKeyService
    / AppUserService を呼ぶ。
"""

import logging
from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlmodel import Session

from app.auth.api_key_service import UserApiKeyService
from app.auth.app_user_service import AppUserService
from app.auth.cognito import cognito_verifier
from app.database import get_session
from app.logging_utils import bind_user_id, log_event
from app.models import AppUser
from app.observability import set_sentry_user_context

# Bearer トークンのセキュリティスキーム（必須 / 任意 の2種類を定義）
security = HTTPBearer()
optional_bearer_security = HTTPBearer(auto_error=False)
api_key_header_security = APIKeyHeader(name="X-API-Key", auto_error=False)
logger = logging.getLogger(__name__)


async def _verify_bearer_token(token: str) -> dict:
    """Bearer トークンを検証してクレームを返す内部ヘルパー。

    検証成功時はログコンテキストと Sentry にユーザー ID を設定する。

    Raises:
        HTTPException: トークン検証失敗時に 401 を送出する。
    """
    try:
        claims = await cognito_verifier.verify_token(token)
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
    except JWTError as exc:
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


def get_current_app_user(
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> AppUser:
    """JWT クレームからアプリローカルのユーザープロファイルを取得・作成する。

    sub クレームが空の場合は 401 を送出する。
    """
    user_id = current_user.get("sub", "")
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
    return AppUserService(session).ensure_app_user(current_user)


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


async def get_folder_note_user_id(
    bearer_credentials: Annotated[
        HTTPAuthorizationCredentials | None, Security(optional_bearer_security)
    ],
    api_key: Annotated[str | None, Security(api_key_header_security)],
    session: Annotated[Session, Depends(get_session)],
) -> str:
    """フォルダ・ノート CRUD のユーザー ID を取得する依存関数。

    Bearer トークンと X-API-Key ヘッダーのどちらかで認証できる。
    どちらも提供されていない場合は 401 を送出する。
    """
    if bearer_credentials is not None:
        # Bearer トークンが提供された場合は JWT で認証する
        claims = await _verify_bearer_token(bearer_credentials.credentials)
        return AppUserService(session).ensure_app_user(claims).user_id

    if api_key is not None:
        stored_key = UserApiKeyService(session).authenticate(api_key)
        if stored_key is not None:
            bind_user_id(stored_key.user_id)
            set_sentry_user_context(stored_key.user_id)
            log_event(
                logger,
                logging.INFO,
                "security.auth.api_key_authenticated",
                outcome="success",
                api_key_id=stored_key.id,
            )
            return stored_key.user_id

        # API キーが提供されたが無効だった場合
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

    # 認証情報が何も提供されなかった場合
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


# 依存性注入で使用する型エイリアス
CurrentUser = Annotated[dict, Depends(get_current_user)]
CurrentAppUser = Annotated[AppUser, Depends(get_current_app_user)]
AdminUser = Annotated[AppUser, Depends(require_admin)]
UserId = Annotated[str, Depends(get_user_id)]
FolderNoteUserId = Annotated[str, Depends(get_folder_note_user_id)]
