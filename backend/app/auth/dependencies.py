from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlmodel import Session

from app.auth.app_user_service import AppUserService
from app.auth.cognito import cognito_verifier
from app.database import get_session
from app.models import AppUser

# Bearer token security scheme
security = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> dict:
    """
    Dependency to get the current authenticated user.

    Args:
        credentials: Bearer token from Authorization header

    Returns:
        The decoded JWT claims

    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials

    try:
        claims = await cognito_verifier.verify_token(token)
        return claims
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_app_user(
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> AppUser:
    """Ensure the authenticated user has an app-local profile."""
    user_id = current_user.get("sub", "")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing user subject",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AppUserService(session).ensure_app_user(current_user)


def get_user_id(app_user: Annotated[AppUser, Depends(get_current_app_user)]) -> str:
    """Extract user ID (sub) from the app-local user profile."""
    return app_user.user_id


def require_admin(
    app_user: Annotated[AppUser, Depends(get_current_app_user)],
) -> AppUser:
    """Require the current user to have admin privileges."""
    if not app_user.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return app_user


# Type alias for dependency injection
CurrentUser = Annotated[dict, Depends(get_current_user)]
CurrentAppUser = Annotated[AppUser, Depends(get_current_app_user)]
AdminUser = Annotated[AppUser, Depends(require_admin)]
UserId = Annotated[str, Depends(get_user_id)]
