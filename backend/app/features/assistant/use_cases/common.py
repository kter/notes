from sqlmodel import Session

from app.features.assistant.errors import (
    TOKEN_LIMIT_EXCEEDED_MESSAGE,
    AITokenLimitExceededError,
)
from app.features.assistant.token_usage_service import check_limit
from app.models import DEFAULT_LLM_MODEL_ID, UserSettings
from app.shared import ValidationFailed


def require_non_empty(value: str, detail: str) -> None:
    if not value.strip():
        raise ValidationFailed(detail)


def ensure_token_limit(session: Session, user_id: str) -> None:
    if not check_limit(session, user_id):
        raise AITokenLimitExceededError(TOKEN_LIMIT_EXCEEDED_MESSAGE)


def get_user_settings(session: Session, user_id: str) -> tuple[str, str]:
    settings = session.get(UserSettings, user_id)
    if settings:
        return settings.llm_model_id, settings.language
    return DEFAULT_LLM_MODEL_ID, "auto"
