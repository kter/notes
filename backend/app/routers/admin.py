from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.auth.dependencies import AdminUser
from app.database import get_session
from app.models import (
    AVAILABLE_LANGUAGES,
    AVAILABLE_MODELS,
    AppUser,
    AppUserRead,
    Folder,
    MCPToken,
    Note,
    TokenUsageRead,
    UserSettings,
    UserSettingsRead,
)
from app.models.user_settings import DEFAULT_LANGUAGE, DEFAULT_LLM_MODEL_ID
from app.routers.db_exceptions import commit_with_error_handling
from app.services.token_usage import get_usage_snapshot

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _build_settings_read(settings: UserSettings | None, user_id: str) -> UserSettingsRead:
    now = datetime.now(UTC)
    return UserSettingsRead(
        user_id=user_id,
        llm_model_id=settings.llm_model_id if settings else DEFAULT_LLM_MODEL_ID,
        language=settings.language if settings else DEFAULT_LANGUAGE,
        token_limit=settings.token_limit if settings else UserSettings.model_fields["token_limit"].default,
        created_at=settings.created_at if settings else now,
        updated_at=settings.updated_at if settings else now,
    )


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


def _count_for_user(session: Session, model: type[Note | Folder | MCPToken], user_id: str) -> int:
    statement = select(func.count()).select_from(model).where(model.user_id == user_id)
    return int(session.exec(statement).one())


def _build_list_item(session: Session, app_user: AppUser) -> AdminUserListItem:
    settings = session.get(UserSettings, app_user.user_id)
    return AdminUserListItem(
        user=AppUserRead.model_validate(app_user),
        settings=_build_settings_read(settings, app_user.user_id),
        token_usage=get_usage_snapshot(session, app_user.user_id),
        note_count=_count_for_user(session, Note, app_user.user_id),
        folder_count=_count_for_user(session, Folder, app_user.user_id),
        mcp_token_count=_count_for_user(session, MCPToken, app_user.user_id),
    )


def _ensure_not_demoting_last_admin(
    session: Session,
    target_user: AppUser,
    requested_admin: bool,
) -> None:
    if requested_admin or not target_user.admin:
        return

    admin_count = int(session.exec(select(func.count()).select_from(AppUser).where(AppUser.admin.is_(True))).one())
    if admin_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the last admin user",
        )


@router.get("/me", response_model=AppUserRead)
def get_admin_me(admin_user: AdminUser):
    """Get the current admin user profile."""
    return AppUserRead.model_validate(admin_user)


@router.get("/users", response_model=AdminUsersListResponse)
def list_admin_users(
    admin_user: AdminUser,
    session: Annotated[Session, Depends(get_session)],
    q: str | None = Query(default=None, min_length=1),
    admin_only: bool | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """List application users for the admin console."""
    del admin_user  # Presence of dependency is enough.
    statement = select(AppUser)

    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                AppUser.user_id.ilike(pattern),
                AppUser.email.ilike(pattern),
                AppUser.display_name.ilike(pattern),
            )
        )
    if admin_only is not None:
        statement = statement.where(AppUser.admin == admin_only)

    total = int(session.exec(select(func.count()).select_from(statement.subquery())).one())
    app_users = session.exec(
        statement.order_by(AppUser.last_seen_at.desc()).offset(offset).limit(limit)
    ).all()

    return AdminUsersListResponse(
        users=[_build_list_item(session, user) for user in app_users],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetailResponse)
def get_admin_user_detail(
    user_id: str,
    admin_user: AdminUser,
    session: Annotated[Session, Depends(get_session)],
):
    """Get the details for a specific application user."""
    del admin_user
    app_user = session.get(AppUser, user_id)
    if app_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    settings = session.get(UserSettings, user_id)
    return AdminUserDetailResponse(
        user=AppUserRead.model_validate(app_user),
        settings=_build_settings_read(settings, user_id),
        token_usage=get_usage_snapshot(session, user_id),
        note_count=_count_for_user(session, Note, user_id),
        folder_count=_count_for_user(session, Folder, user_id),
        mcp_token_count=_count_for_user(session, MCPToken, user_id),
        available_models=AVAILABLE_MODELS,
        available_languages=AVAILABLE_LANGUAGES,
    )


@router.patch("/users/{user_id}", response_model=AdminUserDetailResponse)
def update_admin_user(
    user_id: str,
    payload: AdminUserUpdateRequest,
    admin_user: AdminUser,
    session: Annotated[Session, Depends(get_session)],
):
    """Update admin-controlled fields for a user."""
    del admin_user
    app_user = session.get(AppUser, user_id)
    if app_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    settings = session.get(UserSettings, user_id)
    now = datetime.now(UTC)

    if payload.admin is not None and payload.admin != app_user.admin:
        _ensure_not_demoting_last_admin(session, app_user, payload.admin)
        app_user.admin = payload.admin
        app_user.updated_at = now
        session.add(app_user)

    if payload.llm_model_id is not None or payload.language is not None or payload.token_limit is not None:
        if settings is None:
            settings = UserSettings(user_id=user_id)

        if payload.llm_model_id is not None:
            valid_ids = [model["id"] for model in AVAILABLE_MODELS]
            if payload.llm_model_id not in valid_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid model ID. Must be one of: {valid_ids}",
                )
            settings.llm_model_id = payload.llm_model_id

        if payload.language is not None:
            valid_languages = [language["id"] for language in AVAILABLE_LANGUAGES]
            if payload.language not in valid_languages:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid language. Must be one of: {valid_languages}",
                )
            settings.language = payload.language

        if payload.token_limit is not None:
            settings.token_limit = payload.token_limit

        settings.updated_at = now
        session.add(settings)

    commit_with_error_handling(session, "AdminUserUpdate")
    session.refresh(app_user)
    if settings is not None:
        session.refresh(settings)

    return AdminUserDetailResponse(
        user=AppUserRead.model_validate(app_user),
        settings=_build_settings_read(settings, user_id),
        token_usage=get_usage_snapshot(session, user_id),
        note_count=_count_for_user(session, Note, user_id),
        folder_count=_count_for_user(session, Folder, user_id),
        mcp_token_count=_count_for_user(session, MCPToken, user_id),
        available_models=AVAILABLE_MODELS,
        available_languages=AVAILABLE_LANGUAGES,
    )
