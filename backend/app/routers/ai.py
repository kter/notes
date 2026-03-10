from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import UserId
from app.auth.dependencies import get_owned_resource
from app.database import get_session
from app.models import DEFAULT_LLM_MODEL_ID, Note, UserSettings
from app.models.enums import ChatScope
from app.services import AIService, AIServiceTimeoutError, get_ai_service
from app.services.context import ContextService
from app.services.token_usage import check_limit, record_usage

router = APIRouter()


def get_user_model_id(session: Session, user_id: str) -> str:
    """Get the user's preferred LLM model ID."""
    settings = session.get(UserSettings, user_id)
    if settings:
        return settings.llm_model_id
    return DEFAULT_LLM_MODEL_ID


def get_user_settings(session: Session, user_id: str) -> tuple[str, str]:
    """Get the user's preferred LLM model ID and language.

    Returns:
        Tuple of (model_id, language)
    """
    settings = session.get(UserSettings, user_id)
    if settings:
        return settings.llm_model_id, settings.language
    return DEFAULT_LLM_MODEL_ID, "auto"


def get_context_service(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
) -> ContextService:
    return ContextService(session, user_id)


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


def _check_token_limit(session: Session, user_id: str) -> None:
    """Check if user has exceeded token limit. Raises 429 if exceeded."""
    if not check_limit(session, user_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Monthly token limit exceeded. Your usage will reset at the beginning of next month.",
        )


def _handle_ai_timeout() -> None:
    raise HTTPException(
        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
        detail="AI request timed out. Try a shorter note or edit a smaller section.",
    )


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_note(
    request: SummarizeRequest,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
    ai_service: Annotated[AIService, Depends(get_ai_service)],
):
    """Summarize a note's content using AI."""
    note = get_owned_resource(session, Note, request.note_id, user_id, "Note")

    if not note.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Note content is empty",
        )

    # Check token limit before making AI call
    _check_token_limit(session, user_id)

    model_id, language = get_user_settings(session, user_id)
    try:
        summary, tokens_used = await ai_service.summarize(
            note.content, model_id=model_id, language=language
        )
    except AIServiceTimeoutError:
        _handle_ai_timeout()

    # Record token usage (only if tokens were actually used, not cached)
    if tokens_used > 0:
        record_usage(session, user_id, tokens_used)

    return SummarizeResponse(summary=summary, tokens_used=tokens_used)


@router.post("/chat", response_model=ChatResponse)
async def chat_with_context(
    request: ChatRequest,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
    ai_service: Annotated[AIService, Depends(get_ai_service)],
    context_service: Annotated[ContextService, Depends(get_context_service)],
):
    """Chat with AI about notes' content."""

    # Check token limit before making AI call
    _check_token_limit(session, user_id)

    content = context_service.get_context(
        scope=request.scope,
        note_id=request.note_id,
        folder_id=request.folder_id
    )

    model_id, language = get_user_settings(session, user_id)
    try:
        answer, tokens_used = await ai_service.chat(
            content=content,
            question=request.question,
            history=request.history,
            model_id=model_id,
            language=language,
        )
    except AIServiceTimeoutError:
        _handle_ai_timeout()

    # Record token usage
    if tokens_used > 0:
        record_usage(session, user_id, tokens_used)

    return ChatResponse(answer=answer, tokens_used=tokens_used)


@router.post("/edit", response_model=EditResponse)
async def edit_note_content(
    request: EditRequest,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
    ai_service: Annotated[AIService, Depends(get_ai_service)],
):
    """Edit note content using AI based on user instructions."""
    if not request.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Content is empty",
        )

    if not request.instruction.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Instruction is empty",
        )

    # Verify note ownership if note_id is provided
    if request.note_id:
        get_owned_resource(session, Note, request.note_id, user_id, "Note")

    # Check token limit before making AI call
    _check_token_limit(session, user_id)

    model_id, language = get_user_settings(session, user_id)
    try:
        edited_content, tokens_used = await ai_service.edit(
            content=request.content,
            instruction=request.instruction,
            model_id=model_id,
            language=language,
        )
    except AIServiceTimeoutError:
        _handle_ai_timeout()

    # Record token usage
    if tokens_used > 0:
        record_usage(session, user_id, tokens_used)

    return EditResponse(edited_content=edited_content, tokens_used=tokens_used)
