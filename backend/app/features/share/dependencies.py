from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.features.share.use_cases import ShareUseCases


def get_share_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> ShareUseCases:
    return ShareUseCases(session, user_id)


def get_public_share_use_cases(
    session: Annotated[Session, Depends(get_session)],
) -> ShareUseCases:
    return ShareUseCases(session)
