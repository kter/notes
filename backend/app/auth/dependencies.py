import logging
from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlmodel import Session

from app.auth.api_key_service import UserApiKeyService
from app.auth.app_user_service import AppUserService
from app.auth.cognito import cognito_verifier
from app.database import get_session
from app.logging_utils import bind_user_id, log_event
from app.models import AppUser
from app.observability import set_sentry_user_context

# Bearer token security scheme
security = HTTPBearer()
optional_bearer_security = HTTPBearer(auto_error=False)
api_key_header_security = APIKeyHeader(name="X-API-Key", auto_error=False)
logger = logging.getLogger(__name__)


async def _verify_bearer_token(token: str) -> dict:
    try:
        claims = await cognito_verifier.verify_token(token)
        user_id = claims.get("sub", "")
        if user_id:
            bind_user_id(user_id)
            set_sentry_user_context(user_id)
        log_event(
            logger,
            logging.INFO,
            "security.auth.authenticated",
            outcome="success",
        )
        return claims
    except JWTError as exc:
        log_event(
            logger,
            logging.WARNING,
            "security.auth.failed",
            outcome="failure",
            reason=exc.__class__.__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )


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
    return await _verify_bearer_token(credentials.credentials)


def get_current_app_user(
    current_user: Annotated[dict, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> AppUser:
    """Ensure the authenticated user has an app-local profile."""
    user_id = current_user.get("sub", "")
    if not user_id:
        log_event(
            logger,
            logging.WARNING,
            "security.auth.failed",
            outcome="failure",
            reason="missing_user_subject",
        )
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
        log_event(
            logger,
            logging.WARNING,
            "security.authorization.denied",
            outcome="failure",
            reason="admin_required",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return app_user


async def get_folder_note_user_id(
    bearer_credentials: Annotated[
        HTTPAuthorizationCredentials | None, Security(optional_bearer_security)
    ],
    api_key: Annotated[str | None, Security(api_key_header_security)],
    session: Annotated[Session, Depends(get_session)],
) -> str:
    """Authenticate folder/note CRUD with either a user JWT or a user API key."""
    if bearer_credentials is not None:
        claims = await _verify_bearer_token(bearer_credentials.credentials)
        return AppUserService(session).ensure_app_user(claims).user_id

    if api_key is not None:
        stored_key = UserApiKeyService(session).authenticate(api_key)
        if stored_key is not None:
            bind_user_id(stored_key.user_id)
            set_sentry_user_context(stored_key.user_id)
            log_event(
                logger,
                logging.INFO,
                "security.auth.api_key_authenticated",
                outcome="success",
                api_key_id=stored_key.id,
            )
            return stored_key.user_id

        log_event(
            logger,
            logging.WARNING,
            "security.auth.failed",
            outcome="failure",
            reason="invalid_api_key",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


# Type alias for dependency injection
CurrentUser = Annotated[dict, Depends(get_current_user)]
CurrentAppUser = Annotated[AppUser, Depends(get_current_app_user)]
AdminUser = Annotated[AppUser, Depends(require_admin)]
UserId = Annotated[str, Depends(get_user_id)]
FolderNoteUserId = Annotated[str, Depends(get_folder_note_user_id)]
