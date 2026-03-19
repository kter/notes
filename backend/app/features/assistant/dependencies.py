from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.features.assistant.ai_service import AIService, get_ai_service
from app.features.assistant.use_cases.ai_interactions import AIInteractionUseCases
from app.features.assistant.use_cases.edit_jobs import EditJobUseCases


def get_ai_interaction_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
    ai_service: Annotated[AIService, Depends(get_ai_service)],
) -> AIInteractionUseCases:
    return AIInteractionUseCases(
        session=session, user_id=user_id, ai_service=ai_service
    )


def get_edit_job_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> EditJobUseCases:
    return EditJobUseCases(session=session, user_id=user_id)
