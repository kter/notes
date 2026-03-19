from datetime import UTC, datetime

from sqlmodel import Session

from app.db_commit import commit_with_error_handling
from app.features.assistant.usage_policy import get_usage_info
from app.features.settings.schemas import SettingsResponse
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
from app.shared import ValidationFailed


class SettingsUseCases:
    """Application use cases for user settings flows."""

    def __init__(self, session: Session, user_id: str):
        self.session = session
        self.user_id = user_id

    def get_settings_response(self) -> SettingsResponse:
        settings = self._get_or_create_settings()
        return SettingsResponse(
            settings=self._to_settings_read(settings),
            available_models=self.available_models(),
            available_languages=self.available_languages(),
            token_usage=get_usage_info(self.session, self.user_id),
        )

    def update_settings_response(
        self, settings_in: UserSettingsUpdate
    ) -> SettingsResponse:
        settings = self._update_settings(settings_in)
        return SettingsResponse(
            settings=self._to_settings_read(settings),
            available_models=self.available_models(),
            available_languages=self.available_languages(),
            token_usage=get_usage_info(self.session, self.user_id),
        )

    def _get_or_create_settings(self) -> UserSettings:
        settings = self.session.get(UserSettings, self.user_id)
        if settings is not None:
            return settings

        settings = UserSettings(
            user_id=self.user_id,
            llm_model_id=DEFAULT_LLM_MODEL_ID,
        )
        self.session.add(settings)
        commit_with_error_handling(self.session, "UserSettings")
        self.session.refresh(settings)
        return settings

    def _update_settings(self, settings_in: UserSettingsUpdate) -> UserSettings:
        settings = self.session.get(UserSettings, self.user_id)

        if settings is None:
            settings = UserSettings(
                user_id=self.user_id,
                llm_model_id=settings_in.llm_model_id or DEFAULT_LLM_MODEL_ID,
                language=settings_in.language or DEFAULT_LANGUAGE,
            )
            self.session.add(settings)
        else:
            if settings_in.llm_model_id is not None:
                valid_ids = [model["id"] for model in AVAILABLE_MODELS]
                if settings_in.llm_model_id not in valid_ids:
                    raise ValidationFailed(
                        f"Invalid model ID. Must be one of: {valid_ids}"
                    )
                settings.llm_model_id = settings_in.llm_model_id

            if settings_in.language is not None:
                valid_langs = [language["id"] for language in AVAILABLE_LANGUAGES]
                if settings_in.language not in valid_langs:
                    raise ValidationFailed(
                        f"Invalid language. Must be one of: {valid_langs}"
                    )
                settings.language = settings_in.language

            settings.updated_at = datetime.now(UTC)

        commit_with_error_handling(self.session, "UserSettings")
        self.session.refresh(settings)
        return settings

    def _to_settings_read(self, settings: UserSettings) -> UserSettingsRead:
        return UserSettingsRead(
            user_id=settings.user_id,
            llm_model_id=settings.llm_model_id,
            language=settings.language,
            token_limit=settings.token_limit,
            created_at=settings.created_at,
            updated_at=settings.updated_at,
        )

    @staticmethod
    def available_models() -> list[AvailableModel]:
        return [AvailableModel(**model) for model in AVAILABLE_MODELS]

    @staticmethod
    def available_languages() -> list[AvailableLanguage]:
        return [AvailableLanguage(**language) for language in AVAILABLE_LANGUAGES]
