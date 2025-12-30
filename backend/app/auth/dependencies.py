from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlmodel import Session, SQLModel

from app.auth.cognito import cognito_verifier

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


def get_user_id(user: Annotated[dict, Depends(get_current_user)]) -> str:
    """Extract user ID (sub) from token claims."""
    return user.get("sub", "")


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
UserId = Annotated[str, Depends(get_user_id)]
