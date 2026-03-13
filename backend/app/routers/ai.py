from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.models import AIEditJobCreate, AIEditJobRead
from app.models.enums import ChatScope
from app.services import AIService, get_ai_service
from app.services.ai_application_service import (
    TOKEN_LIMIT_EXCEEDED_MESSAGE,
    AIApplicationService,
    AIApplicationTimeoutError,
    AITokenLimitExceededError,
)
from app.services.edit_jobs import dispatch_edit_job
from app.services.token_usage import check_limit

router = APIRouter()


class SummarizeRequest(BaseModel):
    """Request schema for summarization."""

    note_id: UUID


class SummarizeResponse(BaseModel):
    """Response schema for summarization."""

    summary: str
    tokens_used: int = 0


class ChatRequest(BaseModel):
    """Request schema for chat."""

    scope: ChatScope = ChatScope.NOTE
    note_id: UUID | None = None
    folder_id: UUID | None = None
    question: str
    history: list[dict] | None = None


class ChatResponse(BaseModel):
    """Response schema for chat."""

    answer: str
    tokens_used: int = 0


class EditRequest(BaseModel):
    """Request schema for AI edit."""

    content: str
    instruction: str
    note_id: UUID | None = None


class EditResponse(BaseModel):
    """Response schema for AI edit."""

    edited_content: str
    tokens_used: int = 0


class EditJobCreateResponse(BaseModel):
    """Response returned when an edit job is accepted."""

    job: AIEditJobRead


def _get_ai_application_service(
    session: Session, user_id: str, ai_service: AIService | None = None
) -> AIApplicationService:
    return AIApplicationService(session=session, user_id=user_id, ai_service=ai_service)


def _raise_ai_http_error(exc: Exception) -> None:
    if isinstance(exc, AITokenLimitExceededError):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc

    if isinstance(exc, AIApplicationTimeoutError):
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc

    raise exc


def _check_token_limit(session: Session, user_id: str) -> None:
    if not check_limit(session, user_id):
        _raise_ai_http_error(AITokenLimitExceededError(TOKEN_LIMIT_EXCEEDED_MESSAGE))


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_note(
    request: SummarizeRequest,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
    ai_service: Annotated[AIService, Depends(get_ai_service)],
):
    """Summarize a note's content using AI."""
    application_service = _get_ai_application_service(session, user_id, ai_service)
    try:
        summary, tokens_used = await application_service.summarize_note(request.note_id)
    except (AITokenLimitExceededError, AIApplicationTimeoutError) as exc:
        _raise_ai_http_error(exc)

    return SummarizeResponse(summary=summary, tokens_used=tokens_used)


@router.post("/chat", response_model=ChatResponse)
async def chat_with_context(
    request: ChatRequest,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
    ai_service: Annotated[AIService, Depends(get_ai_service)],
):
    """Chat with AI about notes' content."""
    application_service = _get_ai_application_service(session, user_id, ai_service)
    try:
        answer, tokens_used = await application_service.chat_with_context(
            scope=request.scope,
            question=request.question,
            history=request.history,
            note_id=request.note_id,
            folder_id=request.folder_id,
        )
    except (AITokenLimitExceededError, AIApplicationTimeoutError) as exc:
        _raise_ai_http_error(exc)

    return ChatResponse(answer=answer, tokens_used=tokens_used)


@router.post("/edit", response_model=EditResponse)
async def edit_note_content(
    request: EditRequest,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
    ai_service: Annotated[AIService, Depends(get_ai_service)],
):
    """Edit note content using AI based on user instructions."""
    application_service = _get_ai_application_service(session, user_id, ai_service)
    try:
        edited_content, tokens_used = await application_service.edit_content(
            content=request.content,
            instruction=request.instruction,
            note_id=request.note_id,
        )
    except (AITokenLimitExceededError, AIApplicationTimeoutError) as exc:
        _raise_ai_http_error(exc)

    return EditResponse(edited_content=edited_content, tokens_used=tokens_used)


@router.post(
    "/edit-jobs",
    response_model=EditJobCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_edit_job(
    request: AIEditJobCreate,
    background_tasks: BackgroundTasks,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Queue a long-running AI edit request and return a pollable job resource."""
    application_service = _get_ai_application_service(session, user_id)
    try:
        job = application_service.create_edit_job(request)
    except AITokenLimitExceededError as exc:
        _raise_ai_http_error(exc)

    await dispatch_edit_job(job.id, background_tasks=background_tasks)

    return EditJobCreateResponse(job=AIEditJobRead.model_validate(job))


@router.get("/edit-jobs/{job_id}", response_model=AIEditJobRead)
async def get_edit_job(
    job_id: UUID,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
):
    """Poll an AI edit job."""
    application_service = _get_ai_application_service(session, user_id)
    job = application_service.get_edit_job(job_id)
    return AIEditJobRead.model_validate(job)
