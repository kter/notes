"""assistant ユースケース群で共有するヘルパー関数。

責務: 入力値の空チェック、トークン制限ガード、ユーザー設定取得を提供する。
主要なエクスポート: require_non_empty, ensure_token_limit, get_user_settings
呼び出し関係: AIInteractionUseCases および EditJobUseCases から呼ばれる。
"""

from sqlmodel import Session

from app.features.assistant.errors import (
    TOKEN_LIMIT_EXCEEDED_MESSAGE,
    AITokenLimitExceededError,
)
from app.features.assistant.usage_policy import check_limit
from app.models import DEFAULT_LLM_MODEL_ID, UserSettings
from app.shared import ValidationFailed


def require_non_empty(value: str, detail: str) -> None:
    """値が空文字またはホワイトスペースのみの場合に ValidationFailed を送出する。"""
    if not value.strip():
        raise ValidationFailed(detail)


def ensure_token_limit(session: Session, user_id: str) -> None:
    """トークン上限を超過している場合に AITokenLimitExceededError を送出する。"""
    if not check_limit(session, user_id):
        raise AITokenLimitExceededError(TOKEN_LIMIT_EXCEEDED_MESSAGE)


def get_user_settings(session: Session, user_id: str) -> tuple[str, str]:
    """ユーザー設定から (llm_model_id, language) を返す。未設定の場合はデフォルト値を返す。"""
    settings = session.get(UserSettings, user_id)
    if settings:
        return settings.llm_model_id, settings.language
    return DEFAULT_LLM_MODEL_ID, "auto"
