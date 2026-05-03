"""フォルダの REST APIルーターモジュール。

責務: フォルダに関する CRUD エンドポイントを提供する。
主要なエクスポート: router (APIRouter)
呼び出し関係: workspace のルーターから include_router で登録され、
    FolderUseCases に処理を委譲する。
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.features.workspace.dependencies import get_folder_use_cases
from app.features.workspace.use_cases import FolderUseCases
from app.models import FolderCreate, FolderRead, FolderUpdate

router = APIRouter()


@router.get("", response_model=list[FolderRead])
def list_folders(
    use_cases: Annotated[FolderUseCases, Depends(get_folder_use_cases)],
):
    """現在のユーザーの全フォルダ一覧を返す。"""
    return use_cases.list_folders()


@router.post("", response_model=FolderRead, status_code=status.HTTP_201_CREATED)
def create_folder(
    folder_in: FolderCreate,
    use_cases: Annotated[FolderUseCases, Depends(get_folder_use_cases)],
):
    """新規フォルダを作成して返す。"""
    return use_cases.create_folder(folder_in)


@router.get("/{folder_id}", response_model=FolderRead)
def get_folder(
    folder_id: UUID,
    use_cases: Annotated[FolderUseCases, Depends(get_folder_use_cases)],
):
    """指定した folder_id のフォルダを取得して返す。"""
    return use_cases.get_folder(folder_id)


@router.patch("/{folder_id}", response_model=FolderRead)
def update_folder(
    folder_id: UUID,
    folder_in: FolderUpdate,
    use_cases: Annotated[FolderUseCases, Depends(get_folder_use_cases)],
):
    """指定した folder_id のフォルダを部分更新して返す。"""
    return use_cases.update_folder(folder_id, folder_in)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(
    folder_id: UUID,
    use_cases: Annotated[FolderUseCases, Depends(get_folder_use_cases)],
):
    """指定した folder_id のフォルダを soft delete する (deleted_at を設定)。"""
    use_cases.delete_folder(folder_id)
