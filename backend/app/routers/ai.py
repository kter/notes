from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.models import Note
from app.services import AIService, get_ai_service

router = APIRouter()


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

    summary = await ai_service.summarize(note.content)
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

    answer = await ai_service.chat(
        content=note.content,
        question=request.question,
        history=request.history,
    )
    return ChatResponse(answer=answer)
