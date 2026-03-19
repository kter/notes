"""Share feature package."""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.features.share.use_cases import ShareUseCases

__all__ = ["ShareUseCases", "router"]


def __getattr__(name: str) -> Any:
    if name == "router":
        from app.features.share.router import router

        return router
    if name == "ShareUseCases":
        from app.features.share.use_cases import ShareUseCases

        return ShareUseCases
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
