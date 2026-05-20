"""Amazon Bedrockを介してAIモデルを呼び出すゲートウェイ層。

責務: 要約・チャット・編集の3操作をBedrockのClaude APIにマッピングする。
主要なエクスポート: AIGateway (抽象基底), BedrockGateway, get_ai_gateway。
呼び出し関係: use_cases/ai_interactions.py から呼ばれ、
    summary_cache および core/prompts を利用する。
"""

import asyncio
import json
import logging
import re
from abc import ABC, abstractmethod

import boto3
from botocore.config import Config
from botocore.exceptions import ConnectTimeoutError, ReadTimeoutError

from app.config import get_settings
from app.core.prompts import get_prompt
from app.features.assistant.summary_cache import get_summary_cache
from app.logging_utils import log_event

settings = get_settings()
logger = logging.getLogger(__name__)
# Bedrock接続タイムアウト（秒）: ネットワーク確立までの上限
BEDROCK_CONNECT_TIMEOUT_SECONDS = 5
# Bedrock読み取りタイムアウト（秒）: モデル応答受信までの上限
BEDROCK_READ_TIMEOUT_SECONDS = 45
# この文字数以下のコンテンツはチャンク分割せずに1回のAPI呼び出しで処理する
EDIT_SINGLE_PASS_MAX_CHARS = 12_000
# チャンク分割時の目標文字数（この値を超えたら新チャンクを開始する）
EDIT_CHUNK_TARGET_CHARS = 4_000
# チャンク分割時の上限文字数（セグメントがこれを超える場合は強制分割する）
EDIT_CHUNK_MAX_CHARS = 6_000
# 複数チャンクを並列処理する際の最大同時実行数
EDIT_MAX_CONCURRENCY = 3


class AIGatewayTimeoutError(Exception):
    """上流AIプロバイダーがサービスタイムアウトを超過した場合に送出される。"""


class AIGateway(ABC):
    """AIプロバイダーへの抽象ゲートウェイ。将来的な差し替えを想定した拡張ポイント。"""

    @abstractmethod
    async def summarize(
        self, content: str, model_id: str | None = None, language: str = "auto"
    ) -> tuple[str, int]:
        """コンテンツの要約を生成し、(要約文, 消費トークン数) を返す。"""

    @abstractmethod
    async def chat(
        self,
        content: str,
        question: str,
        history: list[BedrockMessage] | None = None,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        """コンテンツを文脈としてユーザーの質問に回答し、(回答文, 消費トークン数) を返す。"""

    @abstractmethod
    async def edit(
        self,
        content: str,
        instruction: str,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        """指示に従ってコンテンツを編集し、(編集済みコンテンツ, 消費トークン数) を返す。"""


class BedrockGateway(AIGateway):
    """Amazon BedrockのClaude APIを使用する具体的なゲートウェイ実装。"""

    def __init__(self):
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

    def _resolve_language(self, language: str) -> str:
        """'auto' を英語 'en' に解決する。ユーザー設定が未設定の場合のフォールバック。"""
        if language == "auto":
            return "en"
        return language

    async def summarize(
        self, content: str, model_id: str | None = None, language: str = "auto"
    ) -> tuple[str, int]:
        """ノートコンテンツの要約を生成する。S3キャッシュヒット時はトークン消費 0 を返す。"""
        resolved_lang = self._resolve_language(language)

        # S3キャッシュを参照し、ヒットした場合はBedrockを呼び出さずにキャッシュを返す
        summary_cache = get_summary_cache()
        cached_summary = summary_cache.get_cached_summary(content, model_id)
        if cached_summary:
            return cached_summary, 0  # キャッシュヒット: トークンは消費しない

        system = get_prompt("summarize", resolved_lang)
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
        history: list[BedrockMessage] | None = None,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        """ノートコンテンツを文脈としてユーザーの質問に回答する。

        history が存在する場合は会話履歴をメッセージに含める。
        初回メッセージのみコンテンツをプレフィックスとして付与する。
        """
        resolved_lang = self._resolve_language(language)
        system = get_prompt("chat", resolved_lang)
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

        return self._invoke_model(messages, system, model_id=model_id)

    @staticmethod
    def _extract_edited_content(text: str, preserve_whitespace: bool = False) -> str:
        """モデル応答から <edited_content> タグで囲まれた編集済みコンテンツを抽出する。"""
        match = re.search(r"<edited_content>(.*?)</edited_content>", text, re.DOTALL)
        if match:
            content = match.group(1)
            # チャンク結合時は前後の空白を保持する（preserve_whitespace=True）
            return content if preserve_whitespace else content.strip()
        return text.strip()

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

    @staticmethod
    def _split_oversized_segment(segment: str, max_chars: int) -> list[str]:
        """EDIT_CHUNK_MAX_CHARS を超えるセグメントを行単位で強制分割する。"""
        if len(segment) <= max_chars:
            return [segment]

        parts: list[str] = []
        current: list[str] = []
        current_len = 0

        for line in segment.splitlines(keepends=True):
            line_len = len(line)
            if line_len > max_chars:
                # 1行がmax_charsを超える場合は文字単位でスライスする
                if current:
                    parts.append("".join(current))
                    current = []
                    current_len = 0
                for start in range(0, line_len, max_chars):
                    parts.append(line[start : start + max_chars])
                continue

            if current_len + line_len > max_chars and current:
                parts.append("".join(current))
                current = [line]
                current_len = line_len
                continue

            current.append(line)
            current_len += line_len

        if current:
            parts.append("".join(current))

        return parts

    @classmethod
    def _chunk_content_for_edit(cls, content: str) -> list[str]:
        """Markdown構造を保ちながらコンテンツをチャンクに分割する。

        見出し行（#）をセグメント境界として優先的に分割し、
        コードフェンス（``` / ~~~）内では分割しない。
        最終的に EDIT_CHUNK_TARGET_CHARS を目安にセグメントを結合してチャンクを生成する。
        """
        if len(content) <= EDIT_CHUNK_MAX_CHARS:
            return [content]

        segments: list[str] = []
        current: list[str] = []
        in_code_fence = False

        for line in content.splitlines(keepends=True):
            stripped = line.lstrip()
            is_fence = stripped.startswith("```") or stripped.startswith("~~~")

            # コードフェンス外の見出し行でセグメントを区切る
            if current and not in_code_fence and stripped.startswith("#"):
                segments.append("".join(current))
                current = [line]
                if is_fence:
                    in_code_fence = not in_code_fence
                continue

            current.append(line)

            if is_fence:
                in_code_fence = not in_code_fence

            # コードフェンス外の空行でセグメントを区切る
            if not in_code_fence and line.strip() == "":
                segments.append("".join(current))
                current = []

        if current:
            segments.append("".join(current))

        # 超過サイズのセグメントを強制分割して正規化する
        normalized_segments: list[str] = []
        for segment in segments:
            normalized_segments.extend(
                cls._split_oversized_segment(segment, EDIT_CHUNK_MAX_CHARS)
            )

        # セグメントを EDIT_CHUNK_TARGET_CHARS を目安に結合してチャンクを生成する
        chunks: list[str] = []
        chunk_parts: list[str] = []
        chunk_len = 0

        for segment in normalized_segments:
            segment_len = len(segment)

            if chunk_parts and chunk_len + segment_len > EDIT_CHUNK_TARGET_CHARS:
                chunks.append("".join(chunk_parts))
                chunk_parts = [segment]
                chunk_len = segment_len
                continue

            chunk_parts.append(segment)
            chunk_len += segment_len

        if chunk_parts:
            chunks.append("".join(chunk_parts))

        return chunks

    def _edit_single_chunk(
        self,
        content: str,
        instruction: str,
        model_id: str | None,
        system: str,
        chunk_index: int | None = None,
        chunk_count: int | None = None,
        preserve_whitespace: bool = False,
    ) -> tuple[str, int]:
        """単一チャンクをBedrockで編集し、(編集済みコンテンツ, 消費トークン数) を返す。"""
        response_text, total_tokens = self._invoke_model(
            [
                {
                    "role": "user",
                    "content": self._build_edit_message(
                        content=content,
                        instruction=instruction,
                        chunk_index=chunk_index,
                        chunk_count=chunk_count,
                    ),
                }
            ],
            system,
            model_id=model_id,
            max_tokens=8192,  # 編集はトークン上限を広めに設定する
        )
        edited_content = self._extract_edited_content(
            response_text, preserve_whitespace=preserve_whitespace
        )
        return edited_content, total_tokens

    async def edit(
        self,
        content: str,
        instruction: str,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        """指示に従ってコンテンツを編集する。

        EDIT_SINGLE_PASS_MAX_CHARS 以下なら1回のAPI呼び出しで処理する。
        超過する場合はチャンク分割して EDIT_MAX_CONCURRENCY の並列度で処理し、
        結果を順序通りに結合して返す。
        """
        resolved_lang = self._resolve_language(language)
        system = get_prompt("edit", resolved_lang)
        # 短いコンテンツはシングルパスで処理する（チャンク分割のオーバーヘッドを回避）
        if len(content) <= EDIT_SINGLE_PASS_MAX_CHARS:
            return self._edit_single_chunk(content, instruction, model_id, system)

        # 長いコンテンツはチャンク分割して並列処理する
        chunks = self._chunk_content_for_edit(content)
        # セマフォで同時実行数を EDIT_MAX_CONCURRENCY に制限する
        semaphore = asyncio.Semaphore(EDIT_MAX_CONCURRENCY)

        async def edit_chunk(index: int, chunk: str) -> tuple[int, str, int]:
            async with semaphore:
                # 同期処理 (_edit_single_chunk) をスレッドプールで実行する
                edited_chunk, chunk_tokens = await asyncio.to_thread(
                    self._edit_single_chunk,
                    chunk,
                    instruction,
                    model_id,
                    system,
                    index,
                    len(chunks),
                    True,  # チャンク結合時の空白を保持する
                )
                return index, edited_chunk, chunk_tokens

        # 全チャンクを並列処理し、完了を待機する
        results = await asyncio.gather(
            *(edit_chunk(index, chunk) for index, chunk in enumerate(chunks))
        )
        # gather の結果は順不同になる可能性があるため、インデックスで並べ直す
        results.sort(key=lambda item: item[0])

        edited_content = "".join(chunk for _, chunk, _ in results)
        total_tokens = sum(chunk_tokens for _, _, chunk_tokens in results)
        return edited_content, total_tokens


# モジュール起動時にシングルトンインスタンスを生成する
bedrock_gateway = BedrockGateway()


def get_ai_gateway() -> AIGateway:
    """アプリケーション全体で共有するAIゲートウェイのシングルトンを返す。"""
    return bedrock_gateway
