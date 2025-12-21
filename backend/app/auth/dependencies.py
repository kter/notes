from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.auth.cognito import cognito_verifier

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


def get_user_id(user: Annotated[dict, Depends(get_current_user)]) -> str:
    """Extract user ID (sub) from token claims."""
    return user.get("sub", "")


# Type alias for dependency injection
CurrentUser = Annotated[dict, Depends(get_current_user)]
UserId = Annotated[str, Depends(get_user_id)]
