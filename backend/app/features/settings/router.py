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
    """Get user settings. Creates default settings if not exists."""
    return use_cases.get_settings_response()


@router.put("", response_model=SettingsResponse)
async def update_settings(
    settings_in: UserSettingsUpdate,
    use_cases: Annotated[SettingsUseCases, Depends(get_settings_use_cases)],
):
    """Update user settings."""
    return use_cases.update_settings_response(settings_in)


@router.get("/api-keys", response_model=list[UserApiKeyRead])
async def list_api_keys(
    use_cases: Annotated[ApiKeyUseCases, Depends(get_api_key_use_cases)],
):
    """List active API keys for the current user."""
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
    """Create a new API key and return the plaintext secret once."""
    return use_cases.create_api_key(payload)


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: UUID,
    use_cases: Annotated[ApiKeyUseCases, Depends(get_api_key_use_cases)],
):
    """Revoke an API key for the current user."""
    use_cases.revoke_api_key(key_id)
