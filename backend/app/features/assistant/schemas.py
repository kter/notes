"""assistantフィーチャのリクエスト/レスポンス Pydanticスキーマ定義。

責務: APIエンドポイントの入出力型を定義し、バリデーションを担う。
主要なエクスポート: SummarizeRequest/Response, ChatRequest/Response,
    EditRequest/Response, EditJobCreateResponse
呼び出し関係: router.py のエンドポイント関数から参照される。
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import AIEditJobRead
from app.models.enums import ChatScope

# AI 入力の上限値。Bedrock への過大入力によるトークン枯渇・コスト濫用を防ぐ。
# content は長文ノート全体を許容しつつ、無制限の巨大ペイロードは拒否する。
MAX_AI_CONTENT_CHARS = 100_000
MAX_AI_INSTRUCTION_CHARS = 2_000
MAX_AI_QUESTION_CHARS = 4_000


class BedrockMessage(BaseModel):
    """Bedrockへ送信する単一の会話ターンを表すモデル。"""

    role: Literal["user", "assistant"]
    content: str


class SummarizeRequest(BaseModel):
    """要約エンドポイントへのリクエスト。"""

    note_id: UUID


class SummarizeResponse(BaseModel):
    """要約エンドポイントのレスポンス。tokens_used は消費トークン数。"""

    summary: str
    tokens_used: int = 0


class ChatRequest(BaseModel):
    """チャットエンドポイントへのリクエスト。

    scope によって参照コンテキストの範囲が変わる:
    NOTE=単一ノート、FOLDER=フォルダ内全ノート、ALL=全ノート、
    SELECTION=クライアントが送った selected_content のみ。
    """

    scope: ChatScope = ChatScope.NOTE
    note_id: UUID | None = None
    folder_id: UUID | None = None
    question: str = Field(max_length=MAX_AI_QUESTION_CHARS)
    history: list[BedrockMessage] | None = None
    selected_content: str | None = Field(default=None, max_length=MAX_AI_CONTENT_CHARS)


class ChatResponse(BaseModel):
    """チャットエンドポイントのレスポンス。tokens_used は消費トークン数。"""

    answer: str
    tokens_used: int = 0


class EditRequest(BaseModel):
    """同期AI編集エンドポイントへのリクエスト。"""

    content: str = Field(max_length=MAX_AI_CONTENT_CHARS)
    instruction: str = Field(max_length=MAX_AI_INSTRUCTION_CHARS)
    note_id: UUID | None = None


class EditResponse(BaseModel):
    """同期AI編集エンドポイントのレスポンス。tokens_used は消費トークン数。"""

    edited_content: str
    tokens_used: int = 0


class EditJobCreateResponse(BaseModel):
    """編集ジョブ受付時（202 Accepted）のレスポンス。

    job フィールドにジョブIDとステータスが含まれ、クライアントはこれを
    使って GET /edit-jobs/{job_id} でポーリングする。
    """

    job: AIEditJobRead
