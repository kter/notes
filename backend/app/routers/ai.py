from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.models import DEFAULT_LLM_MODEL_ID, Note, UserSettings
from app.services import AIService, get_ai_service

router = APIRouter()


def get_user_model_id(session: Session, user_id: str) -> str:
    """Get the user's preferred LLM model ID."""
    settings = session.get(UserSettings, user_id)
    if settings:
        return settings.llm_model_id
    return DEFAULT_LLM_MODEL_ID


class SummarizeRequest(BaseModel):
    """Request schema for summarization."""

    note_id: UUID


class SummarizeResponse(BaseModel):
    """Response schema for summarization."""

    summary: str


class ChatRequest(BaseModel):
    """Request schema for chat."""

    note_id: UUID
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
    note = session.get(Note, request.note_id)
    if not note or note.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )

    if not note.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Note content is empty",
        )

    model_id = get_user_model_id(session, user_id)
    summary = await ai_service.summarize(note.content, model_id=model_id)
    return SummarizeResponse(summary=summary)


@router.post("/chat", response_model=ChatResponse)
async def chat_with_note(
    request: ChatRequest,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
    ai_service: Annotated[AIService, Depends(get_ai_service)],
):
    """Chat with AI about a note's content."""
    note = session.get(Note, request.note_id)
    if not note or note.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )

    if not note.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Note content is empty",
        )

    model_id = get_user_model_id(session, user_id)
    answer = await ai_service.chat(
        content=note.content,
        question=request.question,
        history=request.history,
        model_id=model_id,
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
    note = session.get(Note, request.note_id)
    if not note or note.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )

    if not note.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Note content is empty",
        )

    model_id = get_user_model_id(session, user_id)
    title = await ai_service.generate_title(note.content, model_id=model_id)
    return GenerateTitleResponse(title=title)

