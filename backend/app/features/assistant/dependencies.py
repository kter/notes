from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.features.assistant.gateway import AIGateway, get_ai_gateway
from app.features.assistant.use_cases.ai_interactions import AIInteractionUseCases
from app.features.assistant.use_cases.edit_jobs import EditJobUseCases
from app.features.workspace.dependencies import get_workspace_query_use_cases
from app.features.workspace.use_cases.queries import WorkspaceQueryUseCases


def get_ai_interaction_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)],
    workspace_queries: Annotated[
        WorkspaceQueryUseCases, Depends(get_workspace_query_use_cases)
    ],
) -> AIInteractionUseCases:
    return AIInteractionUseCases(
        session=session,
        user_id=user_id,
        ai_gateway=ai_gateway,
        workspace_queries=workspace_queries,
    )


def get_edit_job_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
    workspace_queries: Annotated[
        WorkspaceQueryUseCases, Depends(get_workspace_query_use_cases)
    ],
) -> EditJobUseCases:
    return EditJobUseCases(
        session=session,
        user_id=user_id,
        workspace_queries=workspace_queries,
    )
