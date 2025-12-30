"""Database exception handling utilities for routers."""

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session


def commit_with_error_handling(
    session: Session,
    resource_name: str = "Resource",
) -> None:
    """
    Commit the session and convert IntegrityError to appropriate HTTPException.

    Args:
        session: The SQLModel session to commit.
        resource_name: Name of the resource for error messages.

    Raises:
        HTTPException: 400 for foreign key violations, 409 for unique constraint
                       violations, 400 for other integrity errors.
    """
    try:
        session.commit()
    except IntegrityError as e:
        session.rollback()
        error_message = str(e.orig).lower() if e.orig else str(e).lower()

        if "foreign key" in error_message or "fk_" in error_message:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{resource_name} references a non-existent resource",
            )
        elif "unique" in error_message or "duplicate" in error_message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{resource_name} already exists",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Database constraint violation for {resource_name}",
            )
