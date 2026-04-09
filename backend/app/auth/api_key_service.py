import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlmodel import Session, select

from app.db_commit import commit_with_error_handling
from app.models import UserApiKey, UserApiKeyCreate
from app.shared import NotFound, ValidationFailed

API_KEY_PLAIN_PREFIX = "notes_"
API_KEY_PREFIX_LENGTH = 16
API_KEY_TOUCH_INTERVAL = timedelta(minutes=15)


class UserApiKeyService:
    """Create, revoke, list, and authenticate user API keys."""

    def __init__(self, session: Session):
        self.session = session

    def list_active_keys(self, user_id: str) -> list[UserApiKey]:
        statement = (
            select(UserApiKey)
            .where(UserApiKey.user_id == user_id, UserApiKey.revoked_at.is_(None))
            .order_by(UserApiKey.created_at.desc())
        )
        return list(self.session.exec(statement))

    def create_key(
        self, user_id: str, payload: UserApiKeyCreate
    ) -> tuple[UserApiKey, str]:
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
        api_key = self._get_owned_active_key(user_id, key_id)
        api_key.revoked_at = datetime.now(UTC)
        commit_with_error_handling(self.session, "UserApiKey", max_retries=3)

    def authenticate(self, token_plain: str) -> UserApiKey | None:
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
        return f"{API_KEY_PLAIN_PREFIX}{secrets.token_urlsafe(32)}"

    @staticmethod
    def _hash_token(token_plain: str) -> str:
        return hashlib.sha256(token_plain.encode("utf-8")).hexdigest()
