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
    return SettingsUseCases(session, user_id)


def get_api_key_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> ApiKeyUseCases:
    return ApiKeyUseCases(session, user_id)
