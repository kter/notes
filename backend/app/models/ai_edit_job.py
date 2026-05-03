"""AI編集ジョブのDBモデルおよびAPIスキーマを定義するモジュール。

責務: 非同期AI編集ジョブの永続化と、クライアントへのポーリング用レスポンス形成。
主要なエクスポート: AIEditJob, AIEditJobCreate, AIEditJobRead.
呼び出し関係: routers/ai_edit.py および services/ai_edit_service.py から参照される。
"""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import field_validator
from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel

# AI編集ジョブの状態を表す型エイリアス
AIEditJobStatus = Literal["pending", "running", "completed", "failed"]


class AIEditJob(SQLModel, table=True):
    """非同期AI編集ジョブをDBに永続化するテーブルモデル。

    クライアントはジョブIDでポーリングし、edited_content が返るまで待機する。
    content・instruction・edited_content は大きくなり得るため Text 型を使用。
    """

    __tablename__ = "ai_edit_jobs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()  # Cognito ユーザーサブ
    note_id: UUID | None = Field(default=None)  # 編集対象ノートID（任意）
    content: str = Field(default="", sa_column=Column(Text))  # 編集前のノート本文
    instruction: str = Field(default="", sa_column=Column(Text))  # ユーザー編集指示
    status: str = Field(default="pending", max_length=32)  # ジョブ実行状態
    edited_content: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # 編集後本文
    error_message: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # エラー詳細
    tokens_used: int = Field(default=0)  # 消費トークン数
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = Field(default=None)  # 処理開始日時
    completed_at: datetime | None = Field(default=None)  # 処理完了日時


class AIEditJobCreate(SQLModel):
    """AI編集ジョブ作成リクエストスキーマ。"""

    content: str  # 編集前のノート本文
    instruction: str  # 編集指示テキスト
    note_id: UUID | None = None  # 関連付けるノートID（任意）


class AIEditJobRead(SQLModel):
    """AI編集ジョブ取得レスポンススキーマ。

    ポーリング時にクライアントへ返す情報を含む。
    タイムゾーン情報が欠落しているDBの naive datetime は UTC として補完する。
    """

    id: UUID
    note_id: UUID | None
    status: AIEditJobStatus
    edited_content: str | None = None
    error_message: str | None = None
    tokens_used: int = 0
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None

    @field_validator(
        "created_at", "updated_at", "started_at", "completed_at", mode="before"
    )
    @classmethod
    def ensure_utc_timezone(cls, value: datetime | None) -> datetime | None:
        # DB から取得した naive datetime に UTC タイムゾーンを付与する
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value
