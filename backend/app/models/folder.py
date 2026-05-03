"""フォルダ（Folder）に関するモデル定義。

責務: フォルダのDBテーブルモデルおよびAPI入出力スキーマを提供する。
主要なエクスポート: FolderBase, Folder, FolderCreate, FolderUpdate, FolderRead。
呼び出し関係: routers/folders.py およびワークスペース同期処理から参照される。
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import field_validator
from sqlmodel import Field, SQLModel


class FolderBase(SQLModel):
    """フォルダの共通フィールドを保持するベーススキーマ。"""

    name: str = Field(max_length=255)


class Folder(FolderBase, table=True):
    """folders テーブルの ORM モデル。

    Aurora DSQL の制約により user_id にインデックスは付与しない。
    論理削除は deleted_at で管理する。
    """

    __tablename__ = "folders"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()  # Cognito user sub (no index for DSQL compatibility)
    version: int = Field(default=1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    deleted_at: datetime | None = Field(default=None)


class FolderCreate(FolderBase):
    """フォルダ作成リクエスト用スキーマ。"""

    pass


class FolderUpdate(SQLModel):
    """フォルダ更新リクエスト用スキーマ。全フィールド任意。"""

    name: str | None = None


class FolderRead(FolderBase):
    """フォルダ読み取りレスポンス用スキーマ。"""

    id: UUID
    user_id: str
    version: int
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
