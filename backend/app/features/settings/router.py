from typing import Annotated

from fastapi import APIRouter, Depends

from app.features.settings.dependencies import get_settings_use_cases
from app.features.settings.schemas import SettingsResponse
from app.features.settings.use_cases import SettingsUseCases
from app.models import UserSettingsUpdate

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
