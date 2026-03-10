from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlmodel import Session, SQLModel

from app.auth.cognito import cognito_verifier
from app.config import get_settings
from app.database import get_session
from app.models import AppUser
from app.models.app_user import APP_USER_TOUCH_INTERVAL

# Bearer token security scheme
security = HTTPBearer()
settings = get_settings()

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


def _should_bootstrap_admin(claims: dict) -> bool:
    user_id = claims.get("sub", "")
    email = (claims.get("email") or "").lower()
    if settings.environment == "dev" and user_id.startswith("integration-test-user-id"):
        return True
    return (
        user_id in settings.bootstrap_admin_user_id_list
        or email in {item.lower() for item in settings.bootstrap_admin_email_list}
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

    email = current_user.get("email")
    display_name = current_user.get("name") or current_user.get("username")
    now = datetime.now(UTC)
    app_user = session.get(AppUser, user_id)

    if app_user is None:
        app_user = AppUser(
            user_id=user_id,
            email=email,
            display_name=display_name,
            admin=_should_bootstrap_admin(current_user),
            last_seen_at=now,
        )
        session.add(app_user)
        session.commit()
        session.refresh(app_user)
        return app_user

    changed = False
    if email and app_user.email != email:
        app_user.email = email
        changed = True
    if display_name and app_user.display_name != display_name:
        app_user.display_name = display_name
        changed = True
    if _should_bootstrap_admin(current_user) and not app_user.admin:
        app_user.admin = True
        changed = True
    last_seen_at = app_user.last_seen_at
    if last_seen_at.tzinfo is None:
        last_seen_at = last_seen_at.replace(tzinfo=UTC)
    if now - last_seen_at >= APP_USER_TOUCH_INTERVAL:
        app_user.last_seen_at = now
        changed = True
    if changed:
        app_user.updated_at = now
        session.add(app_user)
        session.commit()
        session.refresh(app_user)
    return app_user


def get_user_id(app_user: Annotated[AppUser, Depends(get_current_app_user)]) -> str:
    """Extract user ID (sub) from the app-local user profile."""
    return app_user.user_id


def require_admin(app_user: Annotated[AppUser, Depends(get_current_app_user)]) -> AppUser:
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
