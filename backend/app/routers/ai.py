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
from app.services import AIService, get_ai_service
from app.services.context import ContextService

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


class GenerateTitleRequest(BaseModel):
    """Request schema for title generation."""

    note_id: UUID


class GenerateTitleResponse(BaseModel):
    """Response schema for title generation."""

    title: str


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

    model_id, language = get_user_settings(session, user_id)
    summary = await ai_service.summarize(
        note.content, model_id=model_id, language=language
    )
    return SummarizeResponse(summary=summary)


@router.post("/chat", response_model=ChatResponse)
async def chat_with_context(
    request: ChatRequest,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
    ai_service: Annotated[AIService, Depends(get_ai_service)],
    context_service: Annotated[ContextService, Depends(get_context_service)],
):
    """Chat with AI about notes' content."""
    
    content = context_service.get_context(
        scope=request.scope,
        note_id=request.note_id,
        folder_id=request.folder_id
    )

    model_id, language = get_user_settings(session, user_id)
    answer = await ai_service.chat(
        content=content,
        question=request.question,
        history=request.history,
        model_id=model_id,
        language=language,
    )
    return ChatResponse(answer=answer)


@router.post("/generate-title", response_model=GenerateTitleResponse)
async def generate_title(
    request: GenerateTitleRequest,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
    ai_service: Annotated[AIService, Depends(get_ai_service)],
):
    """Generate a title for a note's content using AI."""
    note = get_owned_resource(session, Note, request.note_id, user_id, "Note")

    if not note.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Note content is empty",
        )

    model_id, language = get_user_settings(session, user_id)
    title = await ai_service.generate_title(
        note.content, model_id=model_id, language=language
    )
    return GenerateTitleResponse(title=title)
