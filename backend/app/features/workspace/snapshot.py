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
    """Return a consolidated workspace snapshot for bootstrap and sync."""
    return use_case.get_snapshot()
