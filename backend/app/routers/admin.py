from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.auth.dependencies import AdminUser
from app.database import get_session
from app.db_commit import commit_with_error_handling
from app.models import AppUserRead
from app.models.admin import (
    AdminUserDetailResponse,
    AdminUsersListResponse,
    AdminUserUpdateRequest,
)
from app.services.admin_service import AdminService

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
    del admin_user
    service = AdminService(session)
    return service.list_users(q=q, admin_only=admin_only, limit=limit, offset=offset)


@router.get("/users/{user_id}", response_model=AdminUserDetailResponse)
def get_admin_user_detail(
    user_id: str,
    admin_user: AdminUser,
    session: Annotated[Session, Depends(get_session)],
):
    """Get the details for a specific application user."""
    del admin_user
    service = AdminService(session)
    return service.get_user_detail(user_id)


@router.patch("/users/{user_id}", response_model=AdminUserDetailResponse)
def update_admin_user(
    user_id: str,
    payload: AdminUserUpdateRequest,
    admin_user: AdminUser,
    session: Annotated[Session, Depends(get_session)],
):
    """Update admin-controlled fields for a user."""
    del admin_user
    service = AdminService(session)
    service.update_user(user_id, payload)
    commit_with_error_handling(session, "AdminUserUpdate")
    return service.get_user_detail(user_id)
