"""assistantフィーチャのHTTPルーター。

責務: AI機能（要約・チャット・編集・編集ジョブ）のエンドポイント定義と
    ドメイン例外→HTTPステータスコードへのマッピング。
主要なエクスポート: router (APIRouter)
呼び出し関係: FastAPIアプリから include_router() でマウントされる。
    各エンドポイントは AIInteractionUseCases / EditJobUseCases を呼び出す。
"""

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
from app.features.assistant.use_cases import AIInteractionUseCases, EditJobUseCases
from app.models import AIEditJobCreate, AIEditJobRead

router = APIRouter()


def _raise_ai_http_error(exc: Exception) -> None:
    """AIドメイン例外を適切なHTTPエラーに変換して送出する。

    トークン上限超過 → 429 Too Many Requests
    タイムアウト     → 504 Gateway Timeout
    その他           → 例外をそのまま再送出
    """
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
    """AIを使ってノートの内容を要約する。"""
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
    """ノートのコンテキストを参照しながらAIとチャットする。"""
    try:
        answer, tokens_used = await use_cases.chat_with_context(
            scope=request.scope,
            question=request.question,
            history=request.history,
            note_id=request.note_id,
            folder_id=request.folder_id,
            selected_content=request.selected_content,
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
    """ユーザーの指示に基づいてAIがノートの内容を編集する（同期）。"""
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
    """長時間かかるAI編集リクエストをジョブとしてキューに登録し、
    202 Accepted でポーリング可能なジョブリソースを返す。

    ジョブ作成後に dispatch_edit_job を呼び出してバックグラウンド処理を開始する。
    """
    try:
        job = use_cases.create_job(request)
    except AITokenLimitExceededError as exc:
        _raise_ai_http_error(exc)

    # SNS/SQSまたはFastAPI BackgroundTasksを通じてジョブを非同期ディスパッチする
    await dispatch_edit_job(job.id, background_tasks=background_tasks)

    return EditJobCreateResponse(job=AIEditJobRead.model_validate(job))


@router.get("/edit-jobs/{job_id}", response_model=AIEditJobRead)
async def get_edit_job(
    job_id: UUID,
    user_id: UserId,
    use_cases: Annotated[EditJobUseCases, Depends(get_edit_job_use_cases)],
):
    """AI編集ジョブの現在ステータスをポーリングする。"""
    job = use_cases.get_job(job_id)
    return AIEditJobRead.model_validate(job)
