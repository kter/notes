"""ノート（Note）に関するモデル定義。

責務: ノートのDBテーブルモデルおよびAPI入出力スキーマを提供する。
主要なエクスポート: NoteBase, Note, NoteCreate, NoteUpdate, NoteRead。
呼び出し関係: routers/notes.py およびワークスペース同期処理から参照される。
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import field_validator
from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel


class NoteBase(SQLModel):
    """ノートの共通フィールドを保持するベーススキーマ。"""

    title: str = Field(max_length=255, default="")
    content: str = Field(default="", sa_column=Column(Text))


class Note(NoteBase, table=True):
    """notes テーブルの ORM モデル。

    Aurora DSQL の制約により外部キー制約・インデックスは使用せず、
    folder_id は論理的な参照のみ。論理削除は deleted_at で管理する。
    """

    __tablename__ = "notes"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()  # Cognito user sub (no index for DSQL compatibility)
    version: int = Field(default=1)
    folder_id: UUID | None = Field(
        default=None
    )  # Logical FK, no constraint (no index for DSQL)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    deleted_at: datetime | None = Field(default=None)


class NoteCreate(NoteBase):
    """ノート作成リクエスト用スキーマ。"""

    folder_id: UUID | None = None


class NoteUpdate(SQLModel):
    """ノート更新リクエスト用スキーマ。全フィールド任意。"""

    title: str | None = None
    content: str | None = None
    folder_id: UUID | None = None


class NoteRead(NoteBase):
    """ノート読み取りレスポンス用スキーマ。"""

    id: UUID
    user_id: str
    version: int
    folder_id: UUID | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    @field_validator("version", mode="before")
    @classmethod
    def ensure_version(cls, value: int | None) -> int:
        # DB に NULL が入り込んだ場合もデフォルト値 1 を返す
        return 1 if value is None else value

    @field_validator("created_at", "updated_at", "deleted_at", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, v: datetime | None) -> datetime | None:
        """タイムゾーン情報が欠落している場合に UTC を付与し、JSON 直列化を正常化する。"""
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v
