"""設定機能の FastAPI 依存関数を定義するモジュール。

責務: DBセッションとユーザーIDから SettingsUseCases・ApiKeyUseCases を生成して提供する。
主要なエクスポート: get_settings_use_cases, get_api_key_use_cases
呼び出し関係: settings/router.py の Depends() から呼ばれる。
"""

from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.features.settings.use_cases import ApiKeyUseCases, SettingsUseCases


def get_settings_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> SettingsUseCases:
    """DBセッションとユーザーIDから SettingsUseCases を生成して返す依存関数。"""
    return SettingsUseCases(session, user_id)


def get_api_key_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> ApiKeyUseCases:
    """DBセッションとユーザーIDから ApiKeyUseCases を生成して返す依存関数。"""
    return ApiKeyUseCases(session, user_id)
