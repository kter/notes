"""ノート共有機能の FastAPI ルーター。

責務: 共有リンクの作成・取得・削除と、共有ノートの公開取得エンドポイントを提供する。
主要なエクスポート: router
呼び出し関係: アプリケーションの main ルーターにマウントされ、
    ShareUseCases を通じてビジネスロジックを呼び出す。
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.features.share.dependencies import (
    get_public_share_use_cases,
    get_share_use_cases,
)
from app.features.share.use_cases import ShareUseCases
from app.models import NoteShareRead, SharedNoteRead

router = APIRouter()


@router.post(
    "/notes/{note_id}/share",
    response_model=NoteShareRead,
    status_code=status.HTTP_201_CREATED,
)
def create_share(
    note_id: UUID,
    use_cases: Annotated[ShareUseCases, Depends(get_share_use_cases)],
):
    """ノートの共有リンクを作成する。ノートのオーナーのみが実行可能。"""
    return use_cases.create_share(note_id)


@router.get("/notes/{note_id}/share", response_model=NoteShareRead | None)
def get_share(
    note_id: UUID,
    use_cases: Annotated[ShareUseCases, Depends(get_share_use_cases)],
):
    """ノートの共有情報を取得する。共有されていない場合は null を返す。"""
    return use_cases.get_share(note_id)


@router.delete("/notes/{note_id}/share", status_code=status.HTTP_204_NO_CONTENT)
def delete_share(
    note_id: UUID,
    use_cases: Annotated[ShareUseCases, Depends(get_share_use_cases)],
):
    """ノートの共有リンクを取り消す。"""
    use_cases.delete_share(note_id)


@router.get("/shared/{token}", response_model=SharedNoteRead)
def get_shared_note(
    token: UUID,
    use_cases: Annotated[ShareUseCases, Depends(get_public_share_use_cases)],
):
    """トークンで共有ノートを取得する。認証不要の公開エンドポイント。"""
    return use_cases.get_shared_note(token)
