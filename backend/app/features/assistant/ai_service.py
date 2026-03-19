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
from app.features.assistant.cache_service import get_cache_service

settings = get_settings()
logger = logging.getLogger(__name__)
BEDROCK_CONNECT_TIMEOUT_SECONDS = 5
BEDROCK_READ_TIMEOUT_SECONDS = 45
EDIT_SINGLE_PASS_MAX_CHARS = 12_000
EDIT_CHUNK_TARGET_CHARS = 4_000
EDIT_CHUNK_MAX_CHARS = 6_000
EDIT_MAX_CONCURRENCY = 3


class AIServiceTimeoutError(Exception):
    """Raised when an upstream AI provider exceeds the service timeout."""


class AIService(ABC):
    """Abstract base class for AI services. Designed for future RAG extensibility."""

    @abstractmethod
    async def summarize(
        self, content: str, model_id: str | None = None, language: str = "auto"
    ) -> tuple[str, int]:
        """Generate a summary of the given content."""

    @abstractmethod
    async def chat(
        self,
        content: str,
        question: str,
        history: list[dict] | None = None,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        """Answer a question based on the given content context."""

    @abstractmethod
    async def edit(
        self,
        content: str,
        instruction: str,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        """Edit content based on the given instruction."""


class BedrockService(AIService):
    """Amazon Bedrock service using Claude."""

    def __init__(self):
        self.client = boto3.client(
            "bedrock-runtime",
            region_name=settings.bedrock_region,
            config=Config(
                connect_timeout=BEDROCK_CONNECT_TIMEOUT_SECONDS,
                read_timeout=BEDROCK_READ_TIMEOUT_SECONDS,
                retries={"max_attempts": 1},
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
        """Invoke the Bedrock model and return the response text and token usage."""
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "messages": messages,
        }

        if system:
            body["system"] = system

        effective_model_id = model_id or self.model_id

        try:
            response = self.client.invoke_model(
                modelId=effective_model_id,
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json",
            )
        except (ConnectTimeoutError, ReadTimeoutError) as exc:
            logger.warning(
                "Bedrock invocation timed out for model %s", effective_model_id
            )
            raise AIServiceTimeoutError(
                f"Bedrock invocation timed out for model {effective_model_id}"
            ) from exc

        response_body = json.loads(response["body"].read())
        text = response_body["content"][0]["text"]
        usage = response_body.get("usage", {})
        total_tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

        return text, total_tokens

    def _resolve_language(self, language: str) -> str:
        """Resolve 'auto' language to default 'en'."""
        if language == "auto":
            return "en"
        return language

    async def summarize(
        self, content: str, model_id: str | None = None, language: str = "auto"
    ) -> tuple[str, int]:
        """Generate a summary of the note content."""
        resolved_lang = self._resolve_language(language)

        cache_service = get_cache_service()
        cached_summary = cache_service.get_cached_summary(content, model_id)
        if cached_summary:
            return cached_summary, 0

        system = get_prompt("summarize", resolved_lang)
        messages = [
            {
                "role": "user",
                "content": f"Please summarize the following note:\n\n{content}",
            }
        ]

        summary, total_tokens = self._invoke_model(messages, system, model_id=model_id)
        cache_service.save_summary(content, model_id, summary)
        return summary, total_tokens

    async def chat(
        self,
        content: str,
        question: str,
        history: list[dict] | None = None,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        """Answer a question about the note content."""
        resolved_lang = self._resolve_language(language)
        system = get_prompt("chat", resolved_lang)
        context_message = f"Here is the note content:\n\n{content}\n\n---\n\n"

        messages = []
        if history:
            for item in history:
                messages.append(
                    {
                        "role": item.get("role", "user"),
                        "content": item.get("content", ""),
                    }
                )

        messages.append(
            {
                "role": "user",
                "content": (
                    context_message + f"Question: {question}"
                    if not history
                    else f"Question: {question}"
                ),
            }
        )

        return self._invoke_model(messages, system, model_id=model_id)

    @staticmethod
    def _extract_edited_content(text: str, preserve_whitespace: bool = False) -> str:
        """Extract content from <edited_content> tags."""
        match = re.search(r"<edited_content>(.*?)</edited_content>", text, re.DOTALL)
        if match:
            content = match.group(1)
            return content if preserve_whitespace else content.strip()
        return text.strip()

    @staticmethod
    def _build_edit_message(
        content: str,
        instruction: str,
        chunk_index: int | None = None,
        chunk_count: int | None = None,
    ) -> str:
        chunk_context = ""
        if chunk_index is not None and chunk_count is not None:
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
        """Split a large segment into smaller contiguous chunks."""
        if len(segment) <= max_chars:
            return [segment]

        parts: list[str] = []
        current: list[str] = []
        current_len = 0

        for line in segment.splitlines(keepends=True):
            line_len = len(line)
            if line_len > max_chars:
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
        """Chunk Markdown-like content while preserving contiguous text."""
        if len(content) <= EDIT_CHUNK_MAX_CHARS:
            return [content]

        segments: list[str] = []
        current: list[str] = []
        in_code_fence = False

        for line in content.splitlines(keepends=True):
            stripped = line.lstrip()
            is_fence = stripped.startswith("```") or stripped.startswith("~~~")

            if current and not in_code_fence and stripped.startswith("#"):
                segments.append("".join(current))
                current = [line]
                if is_fence:
                    in_code_fence = not in_code_fence
                continue

            current.append(line)

            if is_fence:
                in_code_fence = not in_code_fence

            if not in_code_fence and line.strip() == "":
                segments.append("".join(current))
                current = []

        if current:
            segments.append("".join(current))

        normalized_segments: list[str] = []
        for segment in segments:
            normalized_segments.extend(
                cls._split_oversized_segment(segment, EDIT_CHUNK_MAX_CHARS)
            )

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
            max_tokens=8192,
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
        """Edit content based on the given instruction."""
        resolved_lang = self._resolve_language(language)
        system = get_prompt("edit", resolved_lang)
        if len(content) <= EDIT_SINGLE_PASS_MAX_CHARS:
            return self._edit_single_chunk(content, instruction, model_id, system)

        chunks = self._chunk_content_for_edit(content)
        semaphore = asyncio.Semaphore(EDIT_MAX_CONCURRENCY)

        async def edit_chunk(index: int, chunk: str) -> tuple[int, str, int]:
            async with semaphore:
                edited_chunk, chunk_tokens = await asyncio.to_thread(
                    self._edit_single_chunk,
                    chunk,
                    instruction,
                    model_id,
                    system,
                    index,
                    len(chunks),
                    True,
                )
                return index, edited_chunk, chunk_tokens

        results = await asyncio.gather(
            *(edit_chunk(index, chunk) for index, chunk in enumerate(chunks))
        )
        results.sort(key=lambda item: item[0])

        edited_content = "".join(chunk for _, chunk, _ in results)
        total_tokens = sum(chunk_tokens for _, _, chunk_tokens in results)
        return edited_content, total_tokens


bedrock_service = BedrockService()


def get_ai_service() -> AIService:
    """Get the AI service instance."""
    return bedrock_service
