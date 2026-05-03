"""ユーザーごとの月次トークン使用量を管理するDBモデルおよびAPIスキーマを定義するモジュール。

責務: AI機能の利用量を月次集計し、上限超過チェックに使用するデータの永続化。
主要なエクスポート: TokenUsage, TokenUsageRead, MONTHLY_TOKEN_LIMIT.
呼び出し関係: services/token_usage_service.py および routers/token_usage.py から参照される。
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel

# ユーザーあたりの月次トークン上限
MONTHLY_TOKEN_LIMIT = 30_000


def _get_period_start() -> datetime:
    """現在の月次集計期間の開始日時を返す（UTC 当月1日 00:00:00）。"""
    now = datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _get_period_end() -> datetime:
    """現在の月次集計期間の終了日時を返す（UTC 翌月1日 00:00:00）。"""
    now = datetime.now(UTC)
    if now.month == 12:
        return now.replace(
            year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0
        )
    return now.replace(
        month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0
    )


class TokenUsage(SQLModel, table=True):
    """ユーザーごとの月次トークン使用量を追跡するテーブルモデル。

    Aurora DSQL 互換のため user_id にインデックスは付与しない。
    期間は period_start / period_end で管理し、月をまたぐとレコードを新規作成する。
    """

    __tablename__ = "token_usage"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()  # Cognito ユーザーサブ（DSQL互換のためインデックスなし）
    tokens_used: int = Field(default=0)  # 当月の累積消費トークン数
    period_start: datetime = Field(default_factory=_get_period_start)  # 集計期間開始
    period_end: datetime = Field(default_factory=_get_period_end)  # 集計期間終了
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TokenUsageRead(SQLModel):
    """トークン使用量取得レスポンススキーマ。"""

    tokens_used: int  # 当月の累積消費トークン数
    token_limit: int  # 上限トークン数
    period_start: datetime  # 集計期間開始日時
    period_end: datetime  # 集計期間終了日時
