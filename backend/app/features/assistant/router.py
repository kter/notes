from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.auth import UserId
from app.features.assistant.dependencies import (
    get_ai_interaction_use_cases,
    get_edit_job_use_cases,
)
from app.features.assistant.errors import (
    AIApplicationTimeoutError,
    AITokenLimitExceededError,
)
from app.features.assistant.job_runner import dispatch_edit_job
from app.features.assistant.schemas import (
    ChatRequest,
    ChatResponse,
    EditJobCreateResponse,
    EditRequest,
    EditResponse,
    SummarizeRequest,
    SummarizeResponse,
)
from app.features.assistant.use_cases.ai_interactions import AIInteractionUseCases
from app.features.assistant.use_cases.edit_jobs import EditJobUseCases
from app.models import AIEditJobCreate, AIEditJobRead

router = APIRouter()


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


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_note(
    request: SummarizeRequest,
    user_id: UserId,
    use_cases: Annotated[AIInteractionUseCases, Depends(get_ai_interaction_use_cases)],
):
    """Summarize a note's content using AI."""
    try:
        summary, tokens_used = await use_cases.summarize_note(request.note_id)
    except (AITokenLimitExceededError, AIApplicationTimeoutError) as exc:
        _raise_ai_http_error(exc)

    return SummarizeResponse(summary=summary, tokens_used=tokens_used)


@router.post("/chat", response_model=ChatResponse)
async def chat_with_context(
    request: ChatRequest,
    user_id: UserId,
    use_cases: Annotated[AIInteractionUseCases, Depends(get_ai_interaction_use_cases)],
):
    """Chat with AI about notes' content."""
    try:
        answer, tokens_used = await use_cases.chat_with_context(
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
    use_cases: Annotated[AIInteractionUseCases, Depends(get_ai_interaction_use_cases)],
):
    """Edit note content using AI based on user instructions."""
    try:
        edited_content, tokens_used = await use_cases.edit_content(
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
    use_cases: Annotated[EditJobUseCases, Depends(get_edit_job_use_cases)],
):
    """Queue a long-running AI edit request and return a pollable job resource."""
    try:
        job = use_cases.create_job(request)
    except AITokenLimitExceededError as exc:
        _raise_ai_http_error(exc)

    await dispatch_edit_job(job.id, background_tasks=background_tasks)

    return EditJobCreateResponse(job=AIEditJobRead.model_validate(job))


@router.get("/edit-jobs/{job_id}", response_model=AIEditJobRead)
async def get_edit_job(
    job_id: UUID,
    user_id: UserId,
    use_cases: Annotated[EditJobUseCases, Depends(get_edit_job_use_cases)],
):
    """Poll an AI edit job."""
    job = use_cases.get_job(job_id)
    return AIEditJobRead.model_validate(job)
