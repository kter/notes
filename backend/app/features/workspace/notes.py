"""ノートの REST APIルーターモジュール。

責務: ノートに関する CRUD エンドポイントおよびエクスポートエンドポイントを提供する。
主要なエクスポート: router (APIRouter)
呼び出し関係: workspace のルーターから include_router で登録され、
    NoteUseCases / NoteExportUseCase に処理を委譲する。
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse

from app.features.workspace.dependencies import (
    get_note_export_use_case,
    get_note_use_cases,
)
from app.features.workspace.use_cases import NoteExportUseCase, NoteUseCases
from app.models import NoteCreate, NoteRead, NoteUpdate

router = APIRouter()


@router.get("", response_model=list[NoteRead])
def list_notes(
    use_cases: Annotated[NoteUseCases, Depends(get_note_use_cases)],
    folder_id: UUID | None = Query(default=None),
):
    """現在のユーザーのノート一覧を返す。folder_id 指定でフォルダ絞り込みも可能。"""
    return use_cases.list_notes(folder_id)


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(
    note_in: NoteCreate,
    use_cases: Annotated[NoteUseCases, Depends(get_note_use_cases)],
):
    """新規ノートを作成して返す。"""
    return use_cases.create_note(note_in)


@router.get("/{note_id}", response_model=NoteRead)
def get_note(
    note_id: UUID,
    use_cases: Annotated[NoteUseCases, Depends(get_note_use_cases)],
):
    """指定した note_id のノートを取得して返す。"""
    return use_cases.get_note(note_id)


@router.patch("/{note_id}", response_model=NoteRead)
def update_note(
    note_id: UUID,
    note_in: NoteUpdate,
    use_cases: Annotated[NoteUseCases, Depends(get_note_use_cases)],
):
    """指定した note_id のノートを部分更新して返す。"""
    return use_cases.update_note(note_id, note_in)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    note_id: UUID,
    use_cases: Annotated[NoteUseCases, Depends(get_note_use_cases)],
):
    """指定した note_id のノートを soft delete する (deleted_at を設定)。"""
    use_cases.delete_note(note_id)


@router.get("/export/all")
def export_notes(
    use_case: Annotated[NoteExportUseCase, Depends(get_note_export_use_case)],
):
    """全ノートをフォルダ構造を維持したまま ZIP アーカイブとしてエクスポートする。"""
    archive = use_case.export_archive()

    return StreamingResponse(
        iter([archive.data]),
        media_type="application/x-zip-compressed",
        headers={"Content-Disposition": f"attachment; filename={archive.filename}"},
    )
