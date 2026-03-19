from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.features.workspace.use_cases import (
    FolderUseCases,
    NoteExportUseCase,
    NoteUseCases,
    WorkspaceQueryUseCases,
    WorkspaceSnapshotUseCase,
)


def get_folder_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> FolderUseCases:
    return FolderUseCases(session, user_id)


def get_note_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> NoteUseCases:
    return NoteUseCases(session, user_id)


def get_note_export_use_case(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> NoteExportUseCase:
    return NoteExportUseCase(session, user_id)


def get_workspace_query_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> WorkspaceQueryUseCases:
    return WorkspaceQueryUseCases(session, user_id)


def get_workspace_snapshot_use_case(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> WorkspaceSnapshotUseCase:
    return WorkspaceSnapshotUseCase(session, user_id)
