"""管理者向けユーザー管理 API のルーター。

責務: 管理者コンソール用のユーザー一覧・詳細取得・更新エンドポイントを提供する。
主要なエクスポート: router (APIRouter)
呼び出し関係: app.main から include_router され、AdminUseCases を呼び出す。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth import AdminUser
from app.features.admin.dependencies import get_admin_use_cases
from app.features.admin.schemas import (
    AdminUserDetailResponse,
    AdminUsersListResponse,
    AdminUserUpdateRequest,
)
from app.features.admin.use_cases import AdminUseCases
from app.models import AppUserRead

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/me", response_model=AppUserRead)
def get_admin_me(admin_user: AdminUser):
    """ログイン中の管理者ユーザーのプロフィールを返す。"""
    return AppUserRead.model_validate(admin_user)


@router.get("/users", response_model=AdminUsersListResponse)
def list_admin_users(
    admin_user: AdminUser,
    use_cases: Annotated[AdminUseCases, Depends(get_admin_use_cases)],
    q: str | None = Query(default=None, min_length=1, max_length=200),
    admin_only: bool | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """管理者コンソール向けのユーザー一覧をページネーション付きで返す。

    q でユーザーID・メール・表示名の部分一致絞り込み、
    admin_only で管理者フラグによる絞り込みが可能。
    admin_user は認証確認のためのパラメータであり、処理内では使用しない。
    """
    del admin_user
    return use_cases.list_users(q=q, admin_only=admin_only, limit=limit, offset=offset)


@router.get("/users/{user_id}", response_model=AdminUserDetailResponse)
def get_admin_user_detail(
    user_id: str,
    admin_user: AdminUser,
    use_cases: Annotated[AdminUseCases, Depends(get_admin_use_cases)],
):
    """指定ユーザーの詳細情報（設定・トークン使用量・ノート数など）を返す。"""
    del admin_user
    return use_cases.get_user_detail(user_id)


@router.patch("/users/{user_id}", response_model=AdminUserDetailResponse)
def update_admin_user(
    user_id: str,
    payload: AdminUserUpdateRequest,
    admin_user: AdminUser,
    use_cases: Annotated[AdminUseCases, Depends(get_admin_use_cases)],
):
    """管理者権限で制御可能なユーザーフィールド（admin フラグ・モデル・言語・
    トークン上限）を更新する。

    最後の管理者を降格しようとした場合は ValidationFailed を送出する。
    """
    del admin_user
    return use_cases.update_user(user_id, payload)
