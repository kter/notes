from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import UserId
from app.auth.dependencies import get_owned_resource
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


def get_user_settings(session: Session, user_id: str) -> tuple[str, str]:
    """Get the user's preferred LLM model ID and language.
    
    Returns:
        Tuple of (model_id, language)
    """
    settings = session.get(UserSettings, user_id)
    if settings:
        return settings.llm_model_id, settings.language
    return DEFAULT_LLM_MODEL_ID, "auto"


class SummarizeRequest(BaseModel):
    """Request schema for summarization."""

    note_id: UUID


class SummarizeResponse(BaseModel):
    """Response schema for summarization."""

    summary: str


class ChatRequest(BaseModel):
    """Request schema for chat."""

    scope: str = "note"  # "note", "folder", or "all"
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
    summary = await ai_service.summarize(note.content, model_id=model_id, language=language)
    return SummarizeResponse(summary=summary)


@router.post("/chat", response_model=ChatResponse)
async def chat_with_context(
    request: ChatRequest,
    user_id: UserId,
    session: Annotated[Session, Depends(get_session)],
    ai_service: Annotated[AIService, Depends(get_ai_service)],
):
    """Chat with AI about notes' content."""
    from sqlmodel import select

    content = ""
    if request.scope == "note":
        if not request.note_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="note_id is required for note scope",
            )
        note = get_owned_resource(session, Note, request.note_id, user_id, "Note")
        content = note.content
    elif request.scope == "folder":
        if not request.folder_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="folder_id is required for folder scope",
            )
        # Validate folder ownership
        from app.models import Folder
        get_owned_resource(session, Folder, request.folder_id, user_id, "Folder")
        
        # Get all notes in this folder
        statement = select(Note).where(Note.user_id == user_id).where(Note.folder_id == request.folder_id)
        notes = session.exec(statement).all()
        content = "\n\n".join([f"Note: {n.title}\n{n.content}" for n in notes])
    elif request.scope == "all":
        # Get all notes for the user
        statement = select(Note).where(Note.user_id == user_id)
        notes = session.exec(statement).all()
        content = "\n\n".join([f"Note: {n.title}\n{n.content}" for n in notes])
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid scope: {request.scope}",
        )

    if not content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Context content is empty",
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
    title = await ai_service.generate_title(note.content, model_id=model_id, language=language)
    return GenerateTitleResponse(title=title)
