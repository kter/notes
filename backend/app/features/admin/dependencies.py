from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.database import get_session
from app.features.admin.use_cases import AdminUseCases


def get_admin_use_cases(
    session: Annotated[Session, Depends(get_session)],
) -> AdminUseCases:
    return AdminUseCases(session)
