"""ユーザーAPIキーの発行・失効・一覧・認証を担うサービス。

責務: APIキーのライフサイクル全体を管理し、平文トークンをハッシュ化して安全に保存する。
主要なエクスポート: UserApiKeyService
呼び出し関係: 認証ルーターから呼ばれ、DB操作に commit_with_error_handling を使用する。
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlmodel import Session, select

from app.db_commit import commit_with_error_handling
from app.models import UserApiKey, UserApiKeyCreate
from app.shared import NotFound, ValidationFailed

# 発行するAPIキーの平文プレフィックス
API_KEY_PLAIN_PREFIX = "notes_"
# DBに保存するトークンプレフィックスの文字数
API_KEY_PREFIX_LENGTH = 16
# last_used_at を更新する最小間隔（頻繁なDB書き込みを防ぐ）
API_KEY_TOUCH_INTERVAL = timedelta(minutes=15)


class UserApiKeyService:
    """ユーザーAPIキーの作成・失効・一覧取得・認証を行うサービス。"""

    def __init__(self, session: Session):
        self.session = session

    def list_active_keys(self, user_id: str) -> list[UserApiKey]:
        """指定ユーザーの有効なAPIキー一覧を作成日降順で返す。"""
        statement = (
            select(UserApiKey)
            .where(UserApiKey.user_id == user_id, UserApiKey.revoked_at.is_(None))
            .order_by(UserApiKey.created_at.desc())
        )
        return list(self.session.exec(statement))

    def create_key(
        self, user_id: str, payload: UserApiKeyCreate
    ) -> tuple[UserApiKey, str]:
        """新しいAPIキーを生成し、DBレコードと平文トークンをタプルで返す。

        平文トークンはこの時点でしか取得できないため、呼び出し元が安全に伝達する責務を持つ。
        """
        name = payload.name.strip()
        if not name:
            raise ValidationFailed("API key name is required")

        token_plain = self._generate_plain_token()
        api_key = UserApiKey(
            user_id=user_id,
            name=name,
            token_hash=self._hash_token(token_plain),
            token_prefix=token_plain[:API_KEY_PREFIX_LENGTH],
        )
        self.session.add(api_key)
        commit_with_error_handling(self.session, "UserApiKey", max_retries=3)
        self.session.refresh(api_key)
        return api_key, token_plain

    def revoke_key(self, user_id: str, key_id: UUID) -> None:
        """指定されたAPIキーを失効させる。所有者以外のキーは NotFound を送出する。"""
        api_key = self._get_owned_active_key(user_id, key_id)
        api_key.revoked_at = datetime.now(UTC)
        commit_with_error_handling(self.session, "UserApiKey", max_retries=3)

    def authenticate(self, token_plain: str) -> UserApiKey | None:
        """平文トークンを検証し、有効なAPIキーレコードを返す。無効なら None を返す。"""
        token = token_plain.strip()
        if not token:
            return None

        statement = select(UserApiKey).where(
            UserApiKey.token_hash == self._hash_token(token),
            UserApiKey.revoked_at.is_(None),
        )
        api_key = self.session.exec(statement).first()
        if api_key is None:
            return None

        self._touch_last_used(api_key)
        return api_key

    def _get_owned_active_key(self, user_id: str, key_id: UUID) -> UserApiKey:
        """ユーザーが所有する有効なAPIキーを取得する。存在しなければ NotFound を送出する。"""
        statement = select(UserApiKey).where(
            UserApiKey.id == key_id,
            UserApiKey.user_id == user_id,
            UserApiKey.revoked_at.is_(None),
        )
        api_key = self.session.exec(statement).first()
        if api_key is None:
            raise NotFound("API key not found")
        return api_key

    def _touch_last_used(self, api_key: UserApiKey) -> None:
        """last_used_at を現在時刻で更新する。TOUCH_INTERVAL 未満なら書き込みをスキップする。"""
        now = datetime.now(UTC)
        last_used_at = api_key.last_used_at
        if last_used_at is not None and last_used_at.tzinfo is None:
            last_used_at = last_used_at.replace(tzinfo=UTC)

        if last_used_at is not None and now - last_used_at < API_KEY_TOUCH_INTERVAL:
            return

        api_key.last_used_at = now
        commit_with_error_handling(self.session, "UserApiKey", max_retries=3)

    @staticmethod
    def _generate_plain_token() -> str:
        """プレフィックス付きのランダムな平文トークン文字列を生成する。"""
        return f"{API_KEY_PLAIN_PREFIX}{secrets.token_urlsafe(32)}"

    @staticmethod
    def _hash_token(token_plain: str) -> str:
        """平文トークンを SHA-256 でハッシュ化して16進数文字列で返す。"""
        return hashlib.sha256(token_plain.encode("utf-8")).hexdigest()
