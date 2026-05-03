"""管理者コンソール向けのリクエスト・レスポンス スキーマ定義。

責務: AdminUseCases が返すデータ構造と、管理者向け更新リクエストの
      バリデーション モデルを定義する。
主要なエクスポート: AdminUserListItem, AdminUsersListResponse,
                    AdminUserDetailResponse, AdminUserUpdateRequest
呼び出し関係: admin/router.py および admin/use_cases.py から参照される。
"""

from pydantic import BaseModel, Field

from app.models.app_user import AppUserRead
from app.models.token_usage import TokenUsageRead
from app.models.user_settings import UserSettingsRead


class AdminUserListItem(BaseModel):
    """ユーザー一覧の各行に含まれる集約データ。"""

    user: AppUserRead
    settings: UserSettingsRead
    token_usage: TokenUsageRead
    note_count: int
    folder_count: int


class AdminUsersListResponse(BaseModel):
    """ユーザー一覧エンドポイントのページネーション付きレスポンス。"""

    users: list[AdminUserListItem]
    total: int
    limit: int
    offset: int


class AdminUserDetailResponse(BaseModel):
    """ユーザー詳細エンドポイントのレスポンス。選択可能なモデル・言語一覧も含む。"""

    user: AppUserRead
    settings: UserSettingsRead
    token_usage: TokenUsageRead
    note_count: int
    folder_count: int
    available_models: list[dict[str, str]]
    available_languages: list[dict[str, str]]


class AdminUserUpdateRequest(BaseModel):
    """管理者によるユーザー更新リクエスト。未指定フィールドは更新されない。"""

    model_config = {"extra": "forbid"}

    admin: bool | None = None
    llm_model_id: str | None = None
    language: str | None = None
    token_limit: int | None = Field(default=None, ge=1, le=10_000_000)
