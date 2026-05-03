"""ユーザーAPIキーのDBモデルおよびAPIスキーマを定義するモジュール。

責務: アプリケーションユーザーが発行するAPIキーのメタデータ管理と、
      平文トークンは作成時のみレスポンスに含めるセキュリティ設計の実現。
主要なエクスポート: UserApiKey, UserApiKeyCreate, UserApiKeyRead, UserApiKeyCreateResponse.
呼び出し関係: routers/user_api_keys.py および services/auth_service.py から参照される。
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import field_validator
from sqlmodel import Field, SQLModel


class UserApiKeyBase(SQLModel):
    """UserApiKey スキーマ間で共有するフィールドを持つ基底クラス。"""

    name: str = Field(min_length=1, max_length=255)  # APIキーの識別名


class UserApiKey(UserApiKeyBase, table=True):
    """ユーザーAPIキーのメタデータを永続化するテーブルモデル。

    平文トークンはDBに保存せず、SHA-256ハッシュ値のみを保持する。
    token_prefix は表示用途に限定し、認証には token_hash を使用する。
    """

    __tablename__ = "user_api_keys"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field()  # Cognito ユーザーサブ
    token_hash: str = Field(max_length=64)  # SHA-256ハッシュ値（認証用）
    token_prefix: str = Field(max_length=32)  # トークンの先頭数文字（表示用）
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_used_at: datetime | None = Field(default=None)  # 最終使用日時
    revoked_at: datetime | None = Field(
        default=None
    )  # 失効日時（設定済みの場合は無効）


class UserApiKeyCreate(UserApiKeyBase):
    """APIキー作成リクエストスキーマ。"""


class UserApiKeyRead(UserApiKeyBase):
    """APIキーメタデータ取得レスポンススキーマ。平文トークンは含まない。"""

    id: UUID
    user_id: str
    token_prefix: str  # 表示用プレフィックスのみ返却
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None

    @field_validator("created_at", "last_used_at", "revoked_at", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, value: datetime | None) -> datetime | None:
        # DB から取得した naive datetime に UTC タイムゾーンを付与する
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class UserApiKeyCreateResponse(SQLModel):
    """APIキー新規作成時のみ返されるレスポンススキーマ。

    平文トークンはこのレスポンスでのみ返却され、以降は再取得できない。
    """

    api_key: UserApiKeyRead  # キーのメタデータ
    token_plain: str  # 平文トークン（作成時のみ）
