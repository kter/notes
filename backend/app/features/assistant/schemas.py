from uuid import UUID

from pydantic import BaseModel

from app.models import AIEditJobRead
from app.models.enums import ChatScope


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
