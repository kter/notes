from pydantic import BaseModel, Field

from app.models.app_user import AppUserRead
from app.models.token_usage import TokenUsageRead
from app.models.user_settings import UserSettingsRead


class AdminUserListItem(BaseModel):
    user: AppUserRead
    settings: UserSettingsRead
    token_usage: TokenUsageRead
    note_count: int
    folder_count: int
    mcp_token_count: int


class AdminUsersListResponse(BaseModel):
    users: list[AdminUserListItem]
    total: int
    limit: int
    offset: int


class AdminUserDetailResponse(BaseModel):
    user: AppUserRead
    settings: UserSettingsRead
    token_usage: TokenUsageRead
    note_count: int
    folder_count: int
    mcp_token_count: int
    available_models: list[dict[str, str]]
    available_languages: list[dict[str, str]]


class AdminUserUpdateRequest(BaseModel):
    model_config = {"extra": "forbid"}

    admin: bool | None = None
    llm_model_id: str | None = None
    language: str | None = None
    token_limit: int | None = Field(default=None, ge=1, le=10_000_000)
