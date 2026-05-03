"""ワークスペース機能の FastAPI 依存性注入プロバイダー。

責務: 各 UseCase に Session と user_id を注入して返す。
主要なエクスポート: get_folder_use_cases, get_note_use_cases,
    get_note_export_use_case, get_workspace_query_use_cases,
    get_workspace_snapshot_use_case, get_workspace_changes_use_case
呼び出し関係: ルーターのエンドポイントから Depends() 経由で呼ばれる。
"""

from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.auth import FolderNoteUserId, UserId
from app.database import get_session
from app.features.workspace.use_cases import (
    FolderUseCases,
    NoteExportUseCase,
    NoteUseCases,
    WorkspaceChangesUseCase,
    WorkspaceQueryUseCases,
    WorkspaceSnapshotUseCase,
)


def get_folder_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: FolderNoteUserId,
) -> FolderUseCases:
    """フォルダ CRUD ユースケースを生成して返す。"""
    return FolderUseCases(session, user_id)


def get_note_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: FolderNoteUserId,
) -> NoteUseCases:
    """ノート CRUD ユースケースを生成して返す。"""
    return NoteUseCases(session, user_id)


def get_note_export_use_case(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> NoteExportUseCase:
    """ノートエクスポートユースケースを生成して返す。"""
    return NoteExportUseCase(session, user_id)


def get_workspace_query_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> WorkspaceQueryUseCases:
    """読み取り専用のワークスペースクエリユースケースを生成して返す。"""
    return WorkspaceQueryUseCases(session, user_id)


def get_workspace_snapshot_use_case(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> WorkspaceSnapshotUseCase:
    """スナップショット取得ユースケースを生成して返す。"""
    return WorkspaceSnapshotUseCase(session, user_id)


def get_workspace_changes_use_case(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> WorkspaceChangesUseCase:
    """バッチミューテーション適用ユースケースを生成して返す。"""
    return WorkspaceChangesUseCase(session, user_id)
