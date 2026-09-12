"""汎用 AI ジョブ（要約・チャット）の DB モデルおよび API スキーマ。

責務: 同期だと API Gateway の 30 秒上限を超える要約・チャットを非同期ジョブ化し、
    結果をポーリングで取得できるよう永続化する。
主要なエクスポート: AIJob, AIJobRead.
呼び出し関係: features/assistant の router / use_cases / job_runner から参照される。
    既存の AIEditJob（編集専用）と同じ非同期パターンを汎用化したもの。
"""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import field_validator
from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel

# ジョブ種別: 要約 / チャット
AIJobKind = Literal["summarize", "chat"]
# ジョブ実行状態
AIJobStatus = Literal["pending", "running", "completed", "failed"]


class AIJob(SQLModel, table=True):
    """非同期 AI ジョブ（要約・チャット）を DB に永続化するテーブルモデル。

    クライアントはジョブ ID でポーリングし、result が返るまで待機する。
    input は種別ごとに異なるパラメータを JSON 文字列で保持する
    （summarize: {note_id} / chat: {scope, question, history, ...}）。
    """

    __tablename__ = "ai_jobs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()  # Cognito ユーザーサブ
    kind: str = Field(max_length=32)  # "summarize" | "chat"
    status: str = Field(default="pending", max_length=32)  # ジョブ実行状態
    input: str = Field(default="{}", sa_column=Column(Text))  # 実行パラメータ(JSON)
    result: str | None = Field(default=None, sa_column=Column(Text))  # 要約文/回答
    error_message: str | None = Field(
        default=None, sa_column=Column(Text)
    )  # エラー詳細
    tokens_used: int = Field(default=0)  # 消費トークン数
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = Field(default=None)  # 処理開始日時
    completed_at: datetime | None = Field(default=None)  # 処理完了日時

    def apply_result(self, result: str) -> None:
        """実行結果を書き込む。job_lifecycle の状態機械から呼ばれる。"""
        self.result = result

    def log_fields(self) -> dict[str, str]:
        """ジョブのログイベントに添える識別情報を返す。"""
        return {"record": "ai_job", "kind": self.kind}


class AIJobRead(SQLModel):
    """AI ジョブ取得レスポンススキーマ。ポーリング時にクライアントへ返す。

    input は機微・冗長になり得るため返さない。
    DB の naive datetime は UTC として補完する。
    """

    id: UUID
    kind: AIJobKind
    status: AIJobStatus
    result: str | None = None
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
