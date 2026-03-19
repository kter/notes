"""Workspace feature package."""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.features.workspace.repositories import FolderRepository, NoteRepository
    from app.features.workspace.schemas import WorkspaceSnapshotResponse
    from app.features.workspace.use_cases import (
        FolderUseCases,
        NoteExportUseCase,
        NoteUseCases,
        WorkspaceQueryUseCases,
        WorkspaceSnapshotUseCase,
    )

__all__ = [
    "FolderRepository",
    "FolderUseCases",
    "NoteExportUseCase",
    "NoteRepository",
    "NoteUseCases",
    "WorkspaceSnapshotResponse",
    "WorkspaceQueryUseCases",
    "WorkspaceSnapshotUseCase",
    "folders_router",
    "notes_router",
    "snapshot_router",
]


def __getattr__(name: str) -> Any:
    if name == "folders_router":
        from app.features.workspace.folders import router

        return router
    if name == "notes_router":
        from app.features.workspace.notes import router

        return router
    if name == "snapshot_router":
        from app.features.workspace.snapshot import router

        return router
    if name == "WorkspaceSnapshotResponse":
        from app.features.workspace.schemas import WorkspaceSnapshotResponse

        return WorkspaceSnapshotResponse
    if name in {"FolderRepository", "NoteRepository"}:
        from app.features.workspace import repositories

        return getattr(repositories, name)
    if name in {
        "FolderUseCases",
        "NoteExportUseCase",
        "NoteUseCases",
        "WorkspaceQueryUseCases",
        "WorkspaceSnapshotUseCase",
    }:
        from app.features.workspace import use_cases

        return getattr(use_cases, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
