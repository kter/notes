from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.features.settings.schemas import SettingsResponse
from app.features.settings.service import SettingsService
from app.models import UserSettingsRead, UserSettingsUpdate
from app.services.token_usage import get_usage_info

router = APIRouter()


def get_settings_service(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> SettingsService:
    return SettingsService(session, user_id)


@router.get("", response_model=SettingsResponse)
async def get_settings(
    user_id: UserId,
    service: Annotated[SettingsService, Depends(get_settings_service)],
):
    """Get user settings. Creates default settings if not exists."""
    settings = service.get_or_create_settings()
    token_usage = get_usage_info(service.session, user_id)

    return SettingsResponse(
        settings=UserSettingsRead(
            user_id=settings.user_id,
            llm_model_id=settings.llm_model_id,
            language=settings.language,
            token_limit=settings.token_limit,
            created_at=settings.created_at,
            updated_at=settings.updated_at,
        ),
        available_models=service.available_models(),
        available_languages=service.available_languages(),
        token_usage=token_usage,
    )


@router.put("", response_model=SettingsResponse)
async def update_settings(
    settings_in: UserSettingsUpdate,
    user_id: UserId,
    service: Annotated[SettingsService, Depends(get_settings_service)],
):
    """Update user settings."""
    settings = service.update_settings(settings_in)
    token_usage = get_usage_info(service.session, user_id)

    return SettingsResponse(
        settings=UserSettingsRead(
            user_id=settings.user_id,
            llm_model_id=settings.llm_model_id,
            language=settings.language,
            token_limit=settings.token_limit,
            created_at=settings.created_at,
            updated_at=settings.updated_at,
        ),
        available_models=service.available_models(),
        available_languages=service.available_languages(),
        token_usage=token_usage,
    )
