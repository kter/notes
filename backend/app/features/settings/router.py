"""ユーザー設定および API キー管理のエンドポイントを定義するルーターモジュール。

責務: 設定の取得・更新と API キーの一覧・作成・失効を HTTP エンドポイントとして公開する。
主要なエクスポート: router
呼び出し関係: app のメインルーターからマウントされ、SettingsUseCases・ApiKeyUseCases を呼ぶ。
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.features.settings.dependencies import (
    get_api_key_use_cases,
    get_settings_use_cases,
)
from app.features.settings.schemas import SettingsResponse
from app.features.settings.use_cases import ApiKeyUseCases, SettingsUseCases
from app.models import (
    UserApiKeyCreate,
    UserApiKeyCreateResponse,
    UserApiKeyRead,
    UserSettingsUpdate,
)

router = APIRouter()


@router.get("", response_model=SettingsResponse)
async def get_settings(
    use_cases: Annotated[SettingsUseCases, Depends(get_settings_use_cases)],
):
    """ユーザー設定を取得する。設定が未作成の場合はデフォルト値で作成してから返す。"""
    return use_cases.get_settings_response()


@router.put("", response_model=SettingsResponse)
async def update_settings(
    settings_in: UserSettingsUpdate,
    use_cases: Annotated[SettingsUseCases, Depends(get_settings_use_cases)],
):
    """ユーザー設定（LLMモデル・言語など）を更新する。"""
    return use_cases.update_settings_response(settings_in)


@router.get("/api-keys", response_model=list[UserApiKeyRead])
async def list_api_keys(
    use_cases: Annotated[ApiKeyUseCases, Depends(get_api_key_use_cases)],
):
    """現在のユーザーの有効な API キー一覧を返す。"""
    return use_cases.list_api_keys()


@router.post(
    "/api-keys",
    response_model=UserApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_api_key(
    payload: UserApiKeyCreate,
    use_cases: Annotated[ApiKeyUseCases, Depends(get_api_key_use_cases)],
):
    """新しい API キーを作成し、平文トークンを一度だけ返す。"""
    return use_cases.create_api_key(payload)


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: UUID,
    use_cases: Annotated[ApiKeyUseCases, Depends(get_api_key_use_cases)],
):
    """現在のユーザーの指定 API キーを失効させる。"""
    use_cases.revoke_api_key(key_id)
