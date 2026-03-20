from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.auth import get_current_user
from app.database import get_session
from app.features.mcp.use_cases import MCPUseCases


def get_mcp_use_cases(
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> MCPUseCases:
    return MCPUseCases(session, current_user.get("sub"))
