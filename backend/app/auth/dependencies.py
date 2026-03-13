from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlmodel import Session, SQLModel

from app.auth.cognito import cognito_verifier
from app.database import get_session
from app.models import AppUser
from app.services.app_user_service import AppUserService

# Bearer token security scheme
security = HTTPBearer()

# Type variable for models with user_id attribute


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


def get_owned_resource[T: SQLModel](
    session: Session,
    model: type[T],
    resource_id: UUID,
    user_id: str,
    resource_name: str = "Resource",
) -> T:
    """
    Fetch a resource by ID and validate user ownership.

    Args:
        session: Database session
        model: SQLModel class to query
        resource_id: UUID of the resource
        user_id: ID of the current user
        resource_name: Name of the resource for error messages

    Returns:
        The resource if found and owned by the user

    Raises:
        HTTPException: 404 if resource not found or not owned by user
    """
    resource = session.get(model, resource_id)
    if not resource or resource.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{resource_name} not found",
        )
    return resource


# Type alias for dependency injection
CurrentUser = Annotated[dict, Depends(get_current_user)]
CurrentAppUser = Annotated[AppUser, Depends(get_current_app_user)]
AdminUser = Annotated[AppUser, Depends(require_admin)]
UserId = Annotated[str, Depends(get_user_id)]
