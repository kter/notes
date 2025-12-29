from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.models import (
    AVAILABLE_LANGUAGES,
    AVAILABLE_MODELS,
    DEFAULT_LANGUAGE,
    DEFAULT_LLM_MODEL_ID,
    AvailableLanguage,
    AvailableModel,
    UserSettings,
    UserSettingsRead,
    UserSettingsUpdate,
)
from app.routers.db_exceptions import commit_with_error_handling

router = APIRouter()


class SettingsResponse(BaseModel):
    """Response schema for user settings."""

    settings: UserSettingsRead
    available_models: list[AvailableModel]
    available_languages: list[AvailableLanguage]


@router.get("/", response_model=SettingsResponse)
async def get_settings(
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Get user settings. Creates default settings if not exists."""
    settings = session.get(UserSettings, user_id)

    if not settings:
        # Create default settings for new user
        settings = UserSettings(
            user_id=user_id,
            llm_model_id=DEFAULT_LLM_MODEL_ID,
        )
        session.add(settings)
        commit_with_error_handling(session, "UserSettings")
        session.refresh(settings)

    return SettingsResponse(
        settings=UserSettingsRead(
            user_id=settings.user_id,
            llm_model_id=settings.llm_model_id,
            language=settings.language,
            created_at=settings.created_at,
            updated_at=settings.updated_at,
        ),
        available_models=[AvailableModel(**m) for m in AVAILABLE_MODELS],
        available_languages=[AvailableLanguage(**lang) for lang in AVAILABLE_LANGUAGES],
    )


@router.put("/", response_model=UserSettingsRead)
async def update_settings(
    settings_in: UserSettingsUpdate,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Update user settings."""
    settings = session.get(UserSettings, user_id)

    if not settings:
        # Create new settings
        settings = UserSettings(
            user_id=user_id,
            llm_model_id=settings_in.llm_model_id or DEFAULT_LLM_MODEL_ID,
            language=settings_in.language or DEFAULT_LANGUAGE,
        )
        session.add(settings)
    else:
        # Update existing settings
        if settings_in.llm_model_id is not None:
            # Validate model_id is in available models
            valid_ids = [m["id"] for m in AVAILABLE_MODELS]
            if settings_in.llm_model_id not in valid_ids:
                from fastapi import HTTPException, status

                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid model ID. Must be one of: {valid_ids}",
                )
            settings.llm_model_id = settings_in.llm_model_id
        if settings_in.language is not None:
            # Validate language is in available languages
            valid_langs = [lang["id"] for lang in AVAILABLE_LANGUAGES]
            if settings_in.language not in valid_langs:
                from fastapi import HTTPException, status

                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid language. Must be one of: {valid_langs}",
                )
            settings.language = settings_in.language
        settings.updated_at = datetime.now(UTC)

    commit_with_error_handling(session, "UserSettings")
    session.refresh(settings)

    return UserSettingsRead(
        user_id=settings.user_id,
        llm_model_id=settings.llm_model_id,
        language=settings.language,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )
