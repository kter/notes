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
from app.features.settings.repository import UserSettingsRepository
from app.logging_utils import log_event
from app.models import (
    AVAILABLE_LANGUAGES,
    AVAILABLE_MODELS,
    AppUser,
    AppUserRead,
    Folder,
    Note,
    UserSettingsRead,
)
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

        return AdminUserDetailResponse(
            user=AppUserRead.model_validate(app_user),
            settings=self._settings_read(user_id),
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
            # 検証・既定値・updated_at の更新はすべてリポジトリが所有する。
            # AppUser の変更と同一トランザクションでコミットしたいので、
            # ここではコミットしない stage_update を使う。
            UserSettingsRepository(self.session, user_id).stage_update(
                llm_model_id=payload.llm_model_id,
                language=payload.language,
                token_limit=payload.token_limit,
            )

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
        return AdminUserListItem(
            user=AppUserRead.model_validate(app_user),
            settings=self._settings_read(app_user.user_id),
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

    def _settings_read(self, user_id: str) -> UserSettingsRead:
        """指定ユーザーの設定を API 表現で返す。未作成の場合は既定値になる。

        退役モデルの解決を含む変換ポリシーは UserSettingsRepository が所有する。
        以前ここで生値を返していたため、管理コンソールが設定 API 自身は 400 で
        弾く ID を表示しうる状態になっていた。
        """
        repo = UserSettingsRepository(self.session, user_id)
        return repo.to_read(repo.get())
