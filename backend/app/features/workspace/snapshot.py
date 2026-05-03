"""ワークスペーススナップショット取得エンドポイント。

責務: クライアントの初回起動または再同期時に、全フォルダ・ノートを
    含む統合スナップショットを返す。
主要なエクスポート: router (GET /snapshot)
呼び出し関係: workspace ルーターからマウントされ、
    WorkspaceSnapshotUseCase を呼び出す。
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.features.workspace.dependencies import get_workspace_snapshot_use_case
from app.features.workspace.schemas import WorkspaceSnapshotResponse
from app.features.workspace.use_cases import WorkspaceSnapshotUseCase

router = APIRouter()


@router.get("/snapshot", response_model=WorkspaceSnapshotResponse)
def get_workspace_snapshot(
    use_case: Annotated[
        WorkspaceSnapshotUseCase, Depends(get_workspace_snapshot_use_case)
    ],
):
    """ブートストラップおよび同期用のワークスペーススナップショットを返す。"""
    return use_case.get_snapshot()
