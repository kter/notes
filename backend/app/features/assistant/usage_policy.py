"""トークン使用量ポリシーと集計ロジック。

責務: 月次トークン使用量の記録・照合・制限チェックを行う。
主要なエクスポート: check_limit, record_usage, get_usage_info,
    get_usage_snapshot, get_or_create_current_period
呼び出し関係: assistant ユースケース層から呼ばれ、
    TokenUsage モデルを通じてデータベースに読み書きする。
"""

import logging
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.db_commit import commit_with_error_handling
from app.models.token_usage import (
    MONTHLY_TOKEN_LIMIT,
    TokenUsage,
    TokenUsageRead,
    _get_period_end,
    _get_period_start,
)
from app.models.user_settings import UserSettings

logger = logging.getLogger(__name__)


def get_or_create_current_period(session: Session, user_id: str) -> TokenUsage:
    """当月期間のトークン使用量レコードを取得する。存在しない場合は新規作成する。"""
    period_start = _get_period_start()
    statement = select(TokenUsage).where(
        TokenUsage.user_id == user_id,
        TokenUsage.period_start == period_start,
    )
    usage = session.exec(statement).first()

    if usage is None:
        usage = TokenUsage(
            user_id=user_id,
            tokens_used=0,
            period_start=period_start,
            period_end=_get_period_end(),
        )
        session.add(usage)
        commit_with_error_handling(session, "TokenUsage")
        session.refresh(usage)
        logger.info(
            f"Created new token usage period for user {user_id}: {period_start}"
        )

    return usage


def get_current_period_usage(session: Session, user_id: str) -> TokenUsage | None:
    """当月のトークン使用量レコードを取得する。新規作成は行わない。"""
    period_start = _get_period_start()
    statement = select(TokenUsage).where(
        TokenUsage.user_id == user_id,
        TokenUsage.period_start == period_start,
    )
    return session.exec(statement).first()


def _get_user_token_limit(session: Session, user_id: str) -> int:
    """UserSettings からユーザー固有のトークン上限を取得する。未設定の場合はグローバルデフォルトを返す。"""
    settings = session.get(UserSettings, user_id)
    if settings is not None:
        return settings.token_limit
    return MONTHLY_TOKEN_LIMIT


def check_limit(session: Session, user_id: str) -> bool:
    """ユーザーが月次トークン上限を超過していないかを確認する。上限内なら True を返す。"""
    usage = get_or_create_current_period(session, user_id)
    return usage.tokens_used < _get_user_token_limit(session, user_id)


def record_usage(session: Session, user_id: str, tokens: int) -> TokenUsage:
    """当月期間のトークン使用量を加算して永続化する。"""
    usage = get_or_create_current_period(session, user_id)
    usage.tokens_used += tokens
    usage.updated_at = datetime.now(UTC)
    session.add(usage)
    commit_with_error_handling(session, "TokenUsage")
    session.refresh(usage)
    logger.info(
        f"Recorded {tokens} tokens for user {user_id}. Total: {usage.tokens_used}/{MONTHLY_TOKEN_LIMIT}"
    )
    return usage


def get_usage_info(session: Session, user_id: str) -> TokenUsageRead:
    """ユーザーの現在のトークン使用状況を取得する。期間レコードがなければ作成する。"""
    usage = get_or_create_current_period(session, user_id)
    return TokenUsageRead(
        tokens_used=usage.tokens_used,
        token_limit=_get_user_token_limit(session, user_id),
        period_start=usage.period_start,
        period_end=usage.period_end,
    )


def get_usage_snapshot(session: Session, user_id: str) -> TokenUsageRead:
    """使用量レコードを作成せずに現在の使用状況スナップショットを返す。"""
    usage = get_current_period_usage(session, user_id)
    return TokenUsageRead(
        tokens_used=usage.tokens_used if usage else 0,
        token_limit=_get_user_token_limit(session, user_id),
        period_start=usage.period_start if usage else _get_period_start(),
        period_end=usage.period_end if usage else _get_period_end(),
    )
