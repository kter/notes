"""認証済みユーザーのアプリローカルプロファイルを管理するサービス。

責務: JWTクレームを元に AppUser レコードを作成・更新する。
主要なエクスポート: AppUserService
呼び出し関係: 認証ミドルウェアから呼ばれ、DBセッションおよび commit_with_retry を呼ぶ。
"""

from datetime import UTC, datetime

from sqlmodel import Session

from app.config import Settings, get_settings
from app.db_commit import commit_with_retry
from app.models import AppUser
from app.models.app_user import APP_USER_TOUCH_INTERVAL

# コミット競合時の最大リトライ回数
APP_USER_COMMIT_MAX_RETRIES = 3


class AppUserService:
    """認証済みユーザーのアプリローカルプロファイルを保証・更新するサービス。"""

    def __init__(self, session: Session, settings: Settings | None = None):
        self.session = session
        self.settings = settings or get_settings()

    def ensure_app_user(self, claims: dict) -> AppUser:
        """JWTクレームを元に AppUser を取得または新規作成し、属性を最新化して返す。"""
        user_id = claims["sub"]
        email = claims.get("email")
        display_name = claims.get("name") or claims.get("username")
        now = datetime.now(UTC)
        app_user = self.session.get(AppUser, user_id)

        if app_user is None:
            app_user = AppUser(
                user_id=user_id,
                email=email,
                display_name=display_name,
                admin=self.should_bootstrap_admin(claims),
                last_seen_at=now,
            )
            return self._commit_app_user(app_user)

        changed = False
        if email and app_user.email != email:
            app_user.email = email
            changed = True
        if display_name and app_user.display_name != display_name:
            app_user.display_name = display_name
            changed = True
        if self.should_bootstrap_admin(claims) and not app_user.admin:
            app_user.admin = True
            changed = True

        last_seen_at = app_user.last_seen_at
        if last_seen_at.tzinfo is None:
            last_seen_at = last_seen_at.replace(tzinfo=UTC)
        if now - last_seen_at >= APP_USER_TOUCH_INTERVAL:
            app_user.last_seen_at = now
            changed = True

        if changed:
            app_user.updated_at = now
            app_user = self._commit_app_user(app_user)
        return app_user

    def should_bootstrap_admin(self, claims: dict) -> bool:
        """クレームを見てこのユーザーを管理者としてブートストラップすべきか判定する。"""
        user_id = claims.get("sub", "")
        email = (claims.get("email") or "").lower()
        if self.settings.environment == "dev" and user_id.startswith(
            "integration-test-user-id"
        ):
            return True
        if self.settings.environment == "local" and user_id == "local-dev-user-id":
            return True
        return user_id in self.settings.bootstrap_admin_user_id_list or email in {
            item.lower() for item in self.settings.bootstrap_admin_email_list
        }

    def _commit_app_user(self, app_user: AppUser) -> AppUser:
        """AppUser をDBに保存し、競合時は既存レコードを返す。"""
        self.session.add(app_user)
        existing_user = commit_with_retry(
            self.session,
            max_retries=APP_USER_COMMIT_MAX_RETRIES,
            recovery=lambda: self.session.get(AppUser, app_user.user_id),
        )
        if existing_user is not None:
            return existing_user
        self.session.refresh(app_user)
        return app_user
