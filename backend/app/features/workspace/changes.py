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
    """Apply batched workspace mutations and return the updated snapshot."""
    return use_case.apply_changes(request)
