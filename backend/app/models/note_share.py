"""ノートの公開共有機能に関するDBモデルおよびAPIスキーマを定義するモジュール。

責務: ノートを公開URLで共有するためのトークン管理と、公開アクセス用レスポンス形成。
主要なエクスポート: NoteShare, NoteShareCreate, NoteShareRead, SharedNoteRead.
呼び出し関係: routers/note_shares.py から参照される。
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import field_validator
from sqlmodel import Field, SQLModel


class NoteShareBase(SQLModel):
    """NoteShare スキーマの基底クラス。共通フィールドはなく継承用に定義。"""

    pass


class NoteShare(NoteShareBase, table=True):
    """ノート公開共有トークンを管理するテーブルモデル。

    share_token は UUID のため実用上一意であり、Aurora DSQL 互換のためインデックスは付与しない。
    expires_at が設定されている場合、期限切れのトークンは無効として扱う。
    """

    __tablename__ = "note_shares"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    note_id: UUID = Field()  # 共有対象ノートのID
    share_token: UUID = Field(
        default_factory=uuid4
    )  # 公開URLに使用する共有トークン（DSQL互換のためインデックスなし）
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime | None = Field(default=None)  # 有効期限（任意）


class NoteShareCreate(SQLModel):
    """ノート共有作成リクエストスキーマ。トークンは自動生成のため入力フィールドなし。"""

    pass


class NoteShareRead(SQLModel):
    """ノート共有情報取得レスポンススキーマ。"""

    id: UUID
    note_id: UUID
    share_token: UUID
    created_at: datetime
    expires_at: datetime | None

    @field_validator("created_at", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, v: datetime) -> datetime:
        """DBから取得した naive datetime に UTC タイムゾーンを付与してJSONシリアライズを正常化する。"""
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v


class SharedNoteRead(SQLModel):
    """公開共有ノート取得レスポンススキーマ（認証不要の公開エンドポイント用）。

    公開アクセスに必要な最小限のフィールドのみを含む。
    """

    title: str
    content: str
    updated_at: datetime

    @field_validator("updated_at", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, v: datetime) -> datetime:
        """DBから取得した naive datetime に UTC タイムゾーンを付与してJSONシリアライズを正常化する。"""
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v
