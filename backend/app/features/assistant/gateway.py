"""Amazon Bedrockを介してAIモデルを呼び出すゲートウェイ層。

責務: 要約・チャット・編集の3操作をBedrockのClaude APIにマッピングする。
    リクエスト整形とタイムアウト変換のみを担い、Markdown の分割・抽出は
    markdown_chunks が所有する。
主要なエクスポート: AIRequest, AIGateway (抽象基底), BedrockGateway, get_ai_gateway。
呼び出し関係: use_cases/ai_interactions.py から呼ばれ、
    summary_cache・core/prompts・markdown_chunks を利用する。
"""

import asyncio
import json
import logging
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass

import boto3
from botocore.config import Config
from botocore.exceptions import ConnectTimeoutError, ReadTimeoutError

from app.config import get_settings
from app.core.prompts import get_prompt
from app.features.assistant.markdown_chunks import (
    chunk_for_edit,
    extract_tagged,
    join_chunks,
    needs_chunking,
)
from app.features.assistant.schemas import BedrockMessage
from app.features.assistant.summary_cache import SummaryCache, get_summary_cache
from app.logging_utils import log_event

logger = logging.getLogger(__name__)
# Bedrock接続タイムアウト（秒）: ネットワーク確立までの上限
BEDROCK_CONNECT_TIMEOUT_SECONDS = 5
# Bedrock読み取りタイムアウト（秒）: モデル応答受信までの上限
BEDROCK_READ_TIMEOUT_SECONDS = 45
# 複数チャンクを並列処理する際の最大同時実行数
EDIT_MAX_CONCURRENCY = 3


class AIGatewayTimeoutError(Exception):
    """上流AIプロバイダーがサービスタイムアウトを超過した場合に送出される。"""


@dataclass(frozen=True)
class AIRequest:
    """1回の AI 呼び出しに適用するユーザー設定。

    model_id と language は元をたどれば UserSettings の 1 行であり、以前は
    ゲートウェイの全メソッドに 2 引数として個別に流し込まれていた。永続化の
    都合をプロバイダーの抽象インターフェースに通す代わりに、ユースケース側で
    一度だけ組み立ててこの値オブジェクトを渡す。

    "auto" の解決もここが所有する。以前はアダプタ内で毎回 "en" に丸めていた。
    """

    model_id: str | None = None
    language: str = "auto"

    @property
    def resolved_language(self) -> str:
        """プロンプト選択に使う言語。'auto' は英語 'en' にフォールバックする。"""
        return "en" if self.language == "auto" else self.language


@dataclass(frozen=True)
class ChunkContext:
    """分割編集における「全体の何番目のチャンクか」という文脈。

    index / count / 空白保持は常に一緒に動くため、1つの値にまとめる。
    シングルパス編集ではこの文脈自体が存在しない（None）。
    """

    index: int
    count: int


class AIGateway(ABC):
    """AIプロバイダーへの抽象ゲートウェイ。将来的な差し替えを想定した拡張ポイント。"""

    @abstractmethod
    async def summarize(self, content: str, request: AIRequest) -> tuple[str, int]:
        """コンテンツの要約を生成し、(要約文, 消費トークン数) を返す。

        キャッシュヒット時は 0 を返す。0 をどう扱うか（課金するか）は
        呼び出し側の TokenBudget が決める。
        """

    @abstractmethod
    async def chat(
        self,
        content: str,
        question: str,
        request: AIRequest,
        history: list[BedrockMessage] | None = None,
    ) -> tuple[str, int]:
        """コンテンツを文脈としてユーザーの質問に回答し、(回答文, 消費トークン数) を返す。"""

    @abstractmethod
    async def edit(
        self,
        content: str,
        instruction: str,
        request: AIRequest,
        on_usage: Callable[[int], None] | None = None,
    ) -> tuple[str, int]:
        """指示に従ってコンテンツを編集し、(編集済みコンテンツ, 消費トークン数) を返す。

        長いコンテンツは内部で分割され複数回モデルを呼ぶ。on_usage を渡すと
        1 回分が終わるたびに消費トークン数が通知される。呼び出し側が
        「全部終わってから 1 回だけ計上する」のを避けられるようにするため。
        """


class BedrockGateway(AIGateway):
    """Amazon BedrockのClaude APIを使用する具体的なゲートウェイ実装。"""

    def __init__(self, summary_cache: SummaryCache | None = None):
        settings = get_settings()
        # Bedrockクライアントを初期化。タイムアウトはモジュール定数で制御する
        self.client = boto3.client(
            "bedrock-runtime",
            region_name=settings.bedrock_region,
            config=Config(
                connect_timeout=BEDROCK_CONNECT_TIMEOUT_SECONDS,
                read_timeout=BEDROCK_READ_TIMEOUT_SECONDS,
                retries={"max_attempts": 1},  # タイムアウト時はリトライしない
            ),
        )
        self.model_id = settings.bedrock_model_id
        # 遅延解決: chat / edit しか使わない経路で S3 クライアントを作らせない。
        self._summary_cache = summary_cache

    def _get_summary_cache(self) -> SummaryCache:
        """初回の要約時に共有 SummaryCache を解決して返す。"""
        if self._summary_cache is None:
            self._summary_cache = get_summary_cache()
        return self._summary_cache

    def _invoke_model(
        self,
        messages: list[dict],
        system: str | None = None,
        model_id: str | None = None,
        max_tokens: int = 4096,
    ) -> tuple[str, int]:
        """Bedrockモデルを同期呼び出しし、(応答テキスト, 消費トークン数) を返す。

        タイムアウト時は AIGatewayTimeoutError を送出する。
        トークン数は input_tokens + output_tokens の合計値。
        """
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "messages": messages,
        }

        if system:
            body["system"] = system

        # model_id が指定されていない場合はインスタンスのデフォルトを使用する
        effective_model_id = model_id or self.model_id

        try:
            response = self.client.invoke_model(
                modelId=effective_model_id,
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json",
            )
        except (ConnectTimeoutError, ReadTimeoutError) as exc:
            log_event(
                logger,
                logging.WARNING,
                "ops.ai.bedrock.timeout",
                model_id=effective_model_id,
                outcome="timeout",
            )
            raise AIGatewayTimeoutError(
                f"Bedrock invocation timed out for model {effective_model_id}"
            ) from exc

        response_body = json.loads(response["body"].read())
        text = response_body["content"][0]["text"]
        # トークン使用量を集計する（usage キーが存在しない場合は 0 とする）
        usage = response_body.get("usage", {})
        total_tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

        return text, total_tokens

    async def summarize(self, content: str, request: AIRequest) -> tuple[str, int]:
        """ノートコンテンツの要約を生成する。S3キャッシュヒット時はトークン消費 0 を返す。"""
        model_id = request.model_id  # キャッシュキーには解決前の生の値を使う

        # S3キャッシュを参照し、ヒットした場合はBedrockを呼び出さずにキャッシュを返す
        summary_cache = self._get_summary_cache()
        cached_summary = summary_cache.get_cached_summary(content, model_id)
        if cached_summary:
            return cached_summary, 0  # キャッシュヒット: トークンは消費しない

        system = get_prompt("summarize", request.resolved_language)
        messages = [
            {
                "role": "user",
                "content": f"Please summarize the following note:\n\n{content}",
            }
        ]

        # Bedrockを呼び出して要約を生成し、結果をS3キャッシュに保存する
        summary, total_tokens = self._invoke_model(messages, system, model_id=model_id)
        summary_cache.save_summary(content, model_id, summary)
        return summary, total_tokens

    async def chat(
        self,
        content: str,
        question: str,
        request: AIRequest,
        history: list[BedrockMessage] | None = None,
    ) -> tuple[str, int]:
        """ノートコンテンツを文脈としてユーザーの質問に回答する。

        history が存在する場合は会話履歴をメッセージに含める。
        初回メッセージのみコンテンツをプレフィックスとして付与する。
        """
        system = get_prompt("chat", request.resolved_language)
        # 初回メッセージにノートコンテンツを埋め込む
        context_message = f"Here is the note content:\n\n{content}\n\n---\n\n"

        messages = []
        if history:
            # 過去の会話履歴をメッセージリストに展開する
            messages.extend([msg.model_dump() for msg in history])

        messages.append(
            {
                "role": "user",
                "content": (
                    # 初回質問: コンテンツを先頭に付与する
                    context_message + f"Question: {question}"
                    if not history
                    # 継続質問: コンテンツは既に履歴に含まれているため付与しない
                    else f"Question: {question}"
                ),
            }
        )

        return self._invoke_model(messages, system, model_id=request.model_id)

    @staticmethod
    def _build_edit_message(
        content: str,
        instruction: str,
        chunk_index: int | None = None,
        chunk_count: int | None = None,
    ) -> str:
        """編集リクエストのプロンプトメッセージを構築する。

        チャンク処理時はチャンク番号と総数をコンテキストとして付与し、
        モデルが Markdown 構造を保持しながら部分編集できるようにする。
        """
        chunk_context = ""
        if chunk_index is not None and chunk_count is not None:
            # チャンク番号を明示してモデルが文書全体の位置を認識できるようにする
            chunk_context = (
                f"This is chunk {chunk_index + 1} of {chunk_count} from a larger "
                "Markdown document. Preserve the local Markdown structure and "
                "return the full edited chunk only.\n\n"
            )

        return (
            f"{chunk_context}<current_content>\n{content}\n</current_content>\n\n"
            f"Instruction: {instruction}"
        )

    def _edit_single_chunk(
        self,
        content: str,
        instruction: str,
        model_id: str | None,
        system: str,
        chunk: ChunkContext | None = None,
    ) -> tuple[str, int]:
        """単一チャンクをBedrockで編集し、(編集済みコンテンツ, 消費トークン数) を返す。

        chunk が None ならシングルパス編集。分割編集では前後の空白を保持しないと
        チャンク結合時に Markdown の境界が壊れる。
        """
        response_text, total_tokens = self._invoke_model(
            [
                {
                    "role": "user",
                    "content": self._build_edit_message(
                        content=content,
                        instruction=instruction,
                        chunk_index=chunk.index if chunk else None,
                        chunk_count=chunk.count if chunk else None,
                    ),
                }
            ],
            system,
            model_id=model_id,
            max_tokens=8192,  # 編集はトークン上限を広めに設定する
        )
        edited_content = extract_tagged(
            response_text, "edited_content", preserve_whitespace=chunk is not None
        )
        return edited_content, total_tokens

    async def edit(
        self,
        content: str,
        instruction: str,
        request: AIRequest,
        on_usage: Callable[[int], None] | None = None,
    ) -> tuple[str, int]:
        """指示に従ってコンテンツを編集する。

        markdown_chunks.needs_chunking が False なら1回のAPI呼び出しで処理する。
        超過する場合はチャンク分割して EDIT_MAX_CONCURRENCY の並列度で処理し、
        結果を順序通りに結合して返す。
        """
        system = get_prompt("edit", request.resolved_language)
        # 短いコンテンツはシングルパスで処理する（チャンク分割のオーバーヘッドを回避）
        if not needs_chunking(content):
            edited, tokens = self._edit_single_chunk(
                content, instruction, request.model_id, system
            )
            if on_usage is not None:
                on_usage(tokens)
            return edited, tokens

        # 長いコンテンツはチャンク分割して並列処理する
        chunks = chunk_for_edit(content)
        # セマフォで同時実行数を EDIT_MAX_CONCURRENCY に制限する
        semaphore = asyncio.Semaphore(EDIT_MAX_CONCURRENCY)

        async def edit_chunk(index: int, chunk: str) -> tuple[int, str, int]:
            async with semaphore:
                # 同期処理 (_edit_single_chunk) をスレッドプールで実行する
                edited_chunk, chunk_tokens = await asyncio.to_thread(
                    self._edit_single_chunk,
                    chunk,
                    instruction,
                    request.model_id,
                    system,
                    ChunkContext(index=index, count=len(chunks)),
                )
                # チャンク単位で消費を報告する。全チャンク完了を待ってから
                # まとめて計上すると、その間の超過が記録に残らない。
                if on_usage is not None:
                    on_usage(chunk_tokens)
                return index, edited_chunk, chunk_tokens

        # 全チャンクを並列処理し、完了を待機する
        results = await asyncio.gather(
            *(edit_chunk(index, chunk) for index, chunk in enumerate(chunks))
        )
        # gather の結果は順不同になる可能性があるため、インデックスで並べ直す
        results.sort(key=lambda item: item[0])

        edited_content = join_chunks([chunk for _, chunk, _ in results])
        total_tokens = sum(chunk_tokens for _, _, chunk_tokens in results)
        return edited_content, total_tokens


_ai_gateway: AIGateway | None = None


def get_ai_gateway() -> AIGateway:
    """初回利用時に生成したAIゲートウェイのシングルトンを返す。"""
    global _ai_gateway
    if _ai_gateway is None:
        _ai_gateway = BedrockGateway()
    return _ai_gateway


def _reset_ai_gateway_cache() -> None:
    """テスト向けにAIゲートウェイのキャッシュを破棄する。"""
    global _ai_gateway
    _ai_gateway = None
