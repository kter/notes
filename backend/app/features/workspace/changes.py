"""ワークスペース変更適用エンドポイント。

責務: クライアントから受け取ったバッチミューテーションをサーバーに適用し、
    適用結果と最新スナップショットを返す。
主要なエクスポート: router (POST /changes)
呼び出し関係: workspace ルーターからマウントされ、
    WorkspaceChangesUseCase を呼び出す。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.features.workspace.dependencies import get_workspace_changes_use_case
from app.features.workspace.schemas import (
    WorkspaceChangesRequest,
    WorkspaceChangesResponse,
)
from app.features.workspace.use_cases import WorkspaceChangesUseCase

router = APIRouter()


@router.post(
    "/changes", response_model=WorkspaceChangesResponse, status_code=status.HTTP_200_OK
)
def apply_workspace_changes(
    request: WorkspaceChangesRequest,
    use_case: Annotated[
        WorkspaceChangesUseCase, Depends(get_workspace_changes_use_case)
    ],
):
    """バッチミューテーションを適用し、更新済みスナップショットを返す。"""
    return use_case.apply_changes(request)
