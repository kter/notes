"""管理者コンソール向けユーザー管理ユースケースを提供するモジュール。

責務: 管理者がユーザー一覧の取得・詳細確認・設定変更を行うビジネスロジックを担う。
主要なエクスポート: AdminUseCases
呼び出し関係: admin/router.py から呼ばれ、SQLModel Session・usage_policy を利用する。
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.db_commit import commit_with_error_handling
from app.features.admin.schemas import (
    AdminUserDetailResponse,
    AdminUserListItem,
    AdminUsersListResponse,
    AdminUserUpdateRequest,
)
from app.features.assistant.usage_policy import get_usage_snapshot
from app.logging_utils import log_event
from app.models import (
    AVAILABLE_LANGUAGES,
    AVAILABLE_MODELS,
    AppUser,
    AppUserRead,
    Folder,
    Note,
    UserSettings,
    UserSettingsRead,
)
from app.models.user_settings import DEFAULT_LANGUAGE, DEFAULT_LLM_MODEL_ID
from app.shared import NotFound, ValidationFailed

logger = logging.getLogger(__name__)


class AdminUseCases:
    """管理者コンソール向けユーザー管理ユースケース。"""

    def __init__(self, session: Session):
        self.session = session

    def list_users(
        self,
        q: str | None = None,
        admin_only: bool | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> AdminUsersListResponse:
        """ユーザー一覧をページング付きで返す。q で user_id・email・表示名を部分一致検索できる。"""
        statement = select(AppUser)

        if q:
            pattern = f"%{q.strip()}%"
            statement = statement.where(
                or_(
                    AppUser.user_id.ilike(pattern),
                    AppUser.email.ilike(pattern),
                    AppUser.display_name.ilike(pattern),
                )
            )
        if admin_only is not None:
            statement = statement.where(AppUser.admin == admin_only)

        total = int(
            self.session.exec(
                select(func.count()).select_from(statement.subquery())
            ).one()
        )
        app_users = self.session.exec(
            statement.order_by(AppUser.last_seen_at.desc()).offset(offset).limit(limit)
        ).all()

        return AdminUsersListResponse(
            users=[self._build_list_item(user) for user in app_users],
            total=total,
            limit=limit,
            offset=offset,
        )

    def get_user_detail(self, user_id: str) -> AdminUserDetailResponse:
        """指定ユーザーの詳細情報（設定・トークン使用量・ノート数）を返す。存在しない場合は NotFound を送出。"""
        app_user = self.session.get(AppUser, user_id)
        if app_user is None:
            raise NotFound("User not found")

        settings = self.session.get(UserSettings, user_id)
        return AdminUserDetailResponse(
            user=AppUserRead.model_validate(app_user),
            settings=self._build_settings_read(settings, user_id),
            token_usage=get_usage_snapshot(self.session, user_id),
            note_count=self._count_for_user(Note, user_id),
            folder_count=self._count_for_user(Folder, user_id),
            available_models=AVAILABLE_MODELS,
            available_languages=AVAILABLE_LANGUAGES,
        )

    def update_user(
        self, user_id: str, payload: AdminUserUpdateRequest
    ) -> AdminUserDetailResponse:
        """管理者権限・LLMモデル・言語・トークン上限を更新し、更新後の詳細を返す。"""
        app_user = self.session.get(AppUser, user_id)
        if app_user is None:
            raise NotFound("User not found")

        settings = self.session.get(UserSettings, user_id)
        now = datetime.now(UTC)

        if payload.admin is not None and payload.admin != app_user.admin:
            self._ensure_not_demoting_last_admin(app_user, payload.admin)
            app_user.admin = payload.admin
            app_user.updated_at = now
            self.session.add(app_user)

        if (
            payload.llm_model_id is not None
            or payload.language is not None
            or payload.token_limit is not None
        ):
            if settings is None:
                settings = UserSettings(user_id=user_id)

            if payload.llm_model_id is not None:
                valid_ids = [model["id"] for model in AVAILABLE_MODELS]
                if payload.llm_model_id not in valid_ids:
                    raise ValidationFailed(
                        f"Invalid model ID. Must be one of: {valid_ids}"
                    )
                settings.llm_model_id = payload.llm_model_id

            if payload.language is not None:
                valid_languages = [language["id"] for language in AVAILABLE_LANGUAGES]
                if payload.language not in valid_languages:
                    raise ValidationFailed(
                        f"Invalid language. Must be one of: {valid_languages}"
                    )
                settings.language = payload.language

            if payload.token_limit is not None:
                settings.token_limit = payload.token_limit

            settings.updated_at = now
            self.session.add(settings)

        commit_with_error_handling(self.session, "AdminUserUpdate")
        log_event(
            logger,
            logging.INFO,
            "audit.admin.user.updated",
            target_user_id=user_id,
            changed_fields=sorted(payload.model_dump(exclude_unset=True).keys()),
            outcome="success",
        )
        return self.get_user_detail(user_id)

    def _count_for_user(self, model: type[Note | Folder], user_id: str) -> int:
        """指定モデル（Note または Folder）のうち、user_id に紐づくレコード数を返す。"""
        statement = (
            select(func.count()).select_from(model).where(model.user_id == user_id)
        )
        return int(self.session.exec(statement).one())

    def _build_list_item(self, app_user: AppUser) -> AdminUserListItem:
        """AppUser から一覧表示用の AdminUserListItem を組み立てて返す。"""
        settings = self.session.get(UserSettings, app_user.user_id)
        return AdminUserListItem(
            user=AppUserRead.model_validate(app_user),
            settings=self._build_settings_read(settings, app_user.user_id),
            token_usage=get_usage_snapshot(self.session, app_user.user_id),
            note_count=self._count_for_user(Note, app_user.user_id),
            folder_count=self._count_for_user(Folder, app_user.user_id),
        )

    def _ensure_not_demoting_last_admin(
        self,
        target_user: AppUser,
        requested_admin: bool,
    ) -> None:
        """最後の管理者を降格しようとした場合に ValidationFailed を送出するガード処理。"""
        if requested_admin or not target_user.admin:
            return

        admin_count = int(
            self.session.exec(
                select(func.count()).select_from(AppUser).where(AppUser.admin.is_(True))
            ).one()
        )
        if admin_count <= 1:
            raise ValidationFailed("Cannot remove the last admin user")

    @staticmethod
    def _build_settings_read(
        settings: UserSettings | None, user_id: str
    ) -> UserSettingsRead:
        """UserSettings（未作成の場合はデフォルト値）から UserSettingsRead を構築して返す。"""
        now = datetime.now(UTC)
        return UserSettingsRead(
            user_id=user_id,
            llm_model_id=settings.llm_model_id if settings else DEFAULT_LLM_MODEL_ID,
            language=settings.language if settings else DEFAULT_LANGUAGE,
            token_limit=settings.token_limit
            if settings
            else UserSettings.model_fields["token_limit"].default,
            created_at=settings.created_at if settings else now,
            updated_at=settings.updated_at if settings else now,
        )
