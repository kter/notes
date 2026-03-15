from pydantic import BaseModel

from app.models import (
    AvailableLanguage,
    AvailableModel,
    TokenUsageRead,
    UserSettingsRead,
)


class SettingsResponse(BaseModel):
    """Response schema for user settings."""

    settings: UserSettingsRead
    available_models: list[AvailableModel]
    available_languages: list[AvailableLanguage]
    token_usage: TokenUsageRead
