"""Images feature package."""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.features.images.use_cases import ImageUploadUseCases

__all__ = ["ImageUploadUseCases", "router"]


def __getattr__(name: str) -> Any:
    if name == "router":
        from app.features.images.router import router

        return router
    if name == "ImageUploadUseCases":
        from app.features.images.use_cases import ImageUploadUseCases

        return ImageUploadUseCases
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
