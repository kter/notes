from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.features.share.use_cases import ShareUseCases
from app.features.workspace.dependencies import get_workspace_query_use_cases
from app.features.workspace.use_cases import WorkspaceQueryUseCases


def get_share_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
    workspace_queries: Annotated[
        WorkspaceQueryUseCases, Depends(get_workspace_query_use_cases)
    ],
) -> ShareUseCases:
    del user_id
    return ShareUseCases(session, workspace_queries)


def get_public_share_use_cases(
    session: Annotated[Session, Depends(get_session)],
) -> ShareUseCases:
    return ShareUseCases(session)
