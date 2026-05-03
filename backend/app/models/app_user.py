"""アプリケーションユーザー（AppUser）に関するモデル定義。

責務: Cognito の認証情報とは別にアプリケーション側で管理するユーザーメタデータを提供する。
主要なエクスポート: AppUserBase, AppUser, AppUserRead, APP_USER_TOUCH_INTERVAL。
呼び出し関係: 認証ミドルウェアおよび管理機能から参照される。
"""

from datetime import UTC, datetime, timedelta

from pydantic import field_validator
from sqlmodel import Field, SQLModel

# last_seen_at を更新する最小間隔（頻繁な更新によるDB負荷を抑制する）
APP_USER_TOUCH_INTERVAL = timedelta(minutes=30)


class AppUserBase(SQLModel):
    """アプリケーション管理のユーザーメタデータ共通フィールド。"""

    email: str | None = Field(default=None, max_length=320)
    display_name: str | None = Field(default=None, max_length=255)
    admin: bool = Field(default=False)


class AppUser(AppUserBase, table=True):
    """app_users テーブルの ORM モデル。Cognito subject を主キーとする。

    Cognito の認証トークンに含まれる sub をそのまま user_id として使用する。
    """

    __tablename__ = "app_users"

    user_id: str = Field(primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AppUserRead(AppUserBase):
    """アプリケーションユーザー読み取りレスポンス用スキーマ。"""

    user_id: str
    created_at: datetime
    updated_at: datetime
    last_seen_at: datetime

    @field_validator("created_at", "updated_at", "last_seen_at", mode="before")
    @classmethod
    def ensure_utc_timezone(cls, value: datetime) -> datetime:
        """タイムゾーン情報が欠落している場合に UTC を付与し、JSON 直列化を正常化する。"""
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value
