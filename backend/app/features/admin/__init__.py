"""Admin feature package."""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.features.admin.use_cases import AdminUseCases

__all__ = ["AdminUseCases", "router"]


def __getattr__(name: str) -> Any:
    if name == "router":
        from app.features.admin.router import router

        return router
    if name == "AdminUseCases":
        from app.features.admin.use_cases import AdminUseCases

        return AdminUseCases
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
