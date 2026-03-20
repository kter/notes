"""Settings feature package."""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.features.settings.use_cases import SettingsUseCases

__all__ = ["SettingsUseCases", "router"]


def __getattr__(name: str) -> Any:
    if name == "router":
        from app.features.settings.router import router

        return router
    if name == "SettingsUseCases":
        from app.features.settings.use_cases import SettingsUseCases

        return SettingsUseCases
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
