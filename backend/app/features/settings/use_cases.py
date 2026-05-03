"""ユーザー設定および API キー管理のユースケースを提供するモジュール。

責務: 設定の取得・作成・更新と API キーの一覧・作成・失効のビジネスロジックを担う。
主要なエクスポート: SettingsUseCases, ApiKeyUseCases
呼び出し関係: settings/router.py から呼ばれ、UserApiKeyService・usage_policy を利用する。
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlmodel import Session

from app.auth import UserApiKeyService
from app.db_commit import commit_with_error_handling
from app.features.assistant.usage_policy import get_usage_info
from app.features.settings.schemas import SettingsResponse
from app.logging_utils import log_event
from app.models import (
    AVAILABLE_LANGUAGES,
    AVAILABLE_MODELS,
    DEFAULT_LANGUAGE,
    DEFAULT_LLM_MODEL_ID,
    AvailableLanguage,
    AvailableModel,
    UserApiKeyCreate,
    UserApiKeyCreateResponse,
    UserApiKeyRead,
    UserSettings,
    UserSettingsRead,
    UserSettingsUpdate,
)
from app.shared import ValidationFailed

logger = logging.getLogger(__name__)


class SettingsUseCases:
    """ユーザー設定の取得・更新ユースケース。"""

    def __init__(self, session: Session, user_id: str):
        self.session = session
        self.user_id = user_id

    def get_settings_response(self) -> SettingsResponse:
        """設定を取得して SettingsResponse を返す。設定が未作成の場合はデフォルト値で作成する。"""
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
        """設定を更新して SettingsResponse を返す。更新内容を監査ログに記録する。"""
        settings = self._update_settings(settings_in)
        log_event(
            logger,
            logging.INFO,
            "audit.settings.updated",
            changed_fields=sorted(settings_in.model_dump(exclude_unset=True).keys()),
            outcome="success",
        )
        return SettingsResponse(
            settings=self._to_settings_read(settings),
            available_models=self.available_models(),
            available_languages=self.available_languages(),
            token_usage=get_usage_info(self.session, self.user_id),
        )

    def _get_or_create_settings(self) -> UserSettings:
        """既存の UserSettings を返す。存在しない場合はデフォルト値で新規作成してから返す。"""
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
        """設定を更新（未作成なら新規作成）してコミット済みの UserSettings を返す。"""
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
        """UserSettings を UserSettingsRead に変換して返す。"""
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
        """利用可能な LLM モデルの一覧を返す。"""
        return [AvailableModel(**model) for model in AVAILABLE_MODELS]

    @staticmethod
    def available_languages() -> list[AvailableLanguage]:
        """利用可能な言語の一覧を返す。"""
        return [AvailableLanguage(**language) for language in AVAILABLE_LANGUAGES]


class ApiKeyUseCases:
    """ユーザーが自己管理する API キーの操作ユースケース。"""

    def __init__(self, session: Session, user_id: str):
        self.user_id = user_id
        self.service = UserApiKeyService(session)

    def list_api_keys(self) -> list[UserApiKeyRead]:
        """現在のユーザーの有効な API キー一覧を返す。"""
        return [
            UserApiKeyRead.model_validate(item)
            for item in self.service.list_active_keys(self.user_id)
        ]

    def create_api_key(self, payload: UserApiKeyCreate) -> UserApiKeyCreateResponse:
        """新しい API キーを作成し、平文トークンを含むレスポンスを返す。作成を監査ログに記録する。"""
        api_key, token_plain = self.service.create_key(self.user_id, payload)
        log_event(
            logger,
            logging.INFO,
            "audit.api_key.created",
            api_key_id=api_key.id,
            outcome="success",
        )
        return UserApiKeyCreateResponse(
            api_key=UserApiKeyRead.model_validate(api_key),
            token_plain=token_plain,
        )

    def revoke_api_key(self, key_id: UUID) -> None:
        """指定した API キーを失効させ、失効を監査ログに記録する。"""
        self.service.revoke_key(self.user_id, key_id)
        log_event(
            logger,
            logging.INFO,
            "audit.api_key.revoked",
            api_key_id=key_id,
            outcome="success",
        )
