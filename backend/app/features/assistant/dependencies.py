"""assistantフィーチャのFastAPI依存性注入プロバイダー。

責務: ルートハンドラへユースケースインスタンスを注入する。
主要なエクスポート: get_ai_interaction_use_cases, get_edit_job_use_cases。
呼び出し関係: FastAPIのDependsにより各ルートから呼ばれ、
    AIInteractionUseCases / EditJobUseCases を生成して返す。
"""

from typing import Annotated

from fastapi import Depends
from sqlmodel import Session

from app.auth import UserId
from app.database import get_session
from app.features.assistant.gateway import AIGateway, get_ai_gateway
from app.features.assistant.use_cases import AIInteractionUseCases, EditJobUseCases
from app.features.workspace.dependencies import get_workspace_query_use_cases
from app.features.workspace.use_cases import WorkspaceQueryUseCases


def get_ai_interaction_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)],
    workspace_queries: Annotated[
        WorkspaceQueryUseCases, Depends(get_workspace_query_use_cases)
    ],
) -> AIInteractionUseCases:
    """要約・チャット・編集を行う AIInteractionUseCases を生成して返す。"""
    return AIInteractionUseCases(
        session=session,
        user_id=user_id,
        ai_gateway=ai_gateway,
        workspace_queries=workspace_queries,
    )


def get_edit_job_use_cases(
    session: Annotated[Session, Depends(get_session)],
    user_id: UserId,
    workspace_queries: Annotated[
        WorkspaceQueryUseCases, Depends(get_workspace_query_use_cases)
    ],
) -> EditJobUseCases:
    """AI編集ジョブの作成・取得を行う EditJobUseCases を生成して返す。"""
    return EditJobUseCases(
        session=session,
        user_id=user_id,
        workspace_queries=workspace_queries,
    )
