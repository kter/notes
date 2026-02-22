import json
from abc import ABC, abstractmethod

import boto3

from app.config import get_settings
from app.core.prompts import get_prompt
from app.services.cache import get_cache_service

settings = get_settings()


class AIService(ABC):
    """Abstract base class for AI services. Designed for future RAG extensibility."""

    @abstractmethod
    async def summarize(
        self, content: str, model_id: str | None = None, language: str = "auto"
    ) -> tuple[str, int]:
        """Generate a summary of the given content.

        Returns:
            Tuple of (summary_text, total_tokens_used)
        """
        pass

    @abstractmethod
    async def chat(
        self,
        content: str,
        question: str,
        history: list[dict] | None = None,
        model_id: str | None = None,
        language: str = "auto",
    ) -> tuple[str, int]:
        """Answer a question based on the given content context.

        Returns:
            Tuple of (answer_text, total_tokens_used)
        """
        pass




class BedrockService(AIService):
    """Amazon Bedrock service using Claude."""

    def __init__(self):
        self.client = boto3.client(
            "bedrock-runtime",
            region_name=settings.bedrock_region,
        )
        self.model_id = settings.bedrock_model_id

    def _invoke_model(
        self,
        messages: list[dict],
        system: str | None = None,
        model_id: str | None = None,
    ) -> tuple[str, int]:
        """Invoke the Bedrock model and return the response text and token usage.

        Returns:
            Tuple of (response_text, total_tokens_used)
        """
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "messages": messages,
        }

        if system:
            body["system"] = system

        # Use provided model_id or fall back to default
        effective_model_id = model_id or self.model_id

        response = self.client.invoke_model(
            modelId=effective_model_id,
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json",
        )

        response_body = json.loads(response["body"].read())
        text = response_body["content"][0]["text"]

        # Extract token usage from response
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
        """Generate a summary of the note content.

        Returns:
            Tuple of (summary_text, total_tokens_used)
        """
        resolved_lang = self._resolve_language(language)
        
        # Check cache
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
        
        # Save to cache
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
        """Answer a question about the note content.

        Returns:
            Tuple of (answer_text, total_tokens_used)
        """
        resolved_lang = self._resolve_language(language)
        system = get_prompt("chat", resolved_lang)

        # Build context message
        context_message = f"Here is the note content:\n\n{content}\n\n---\n\n"

        messages = []

        # Add conversation history if provided
        if history:
            for item in history:
                messages.append(
                    {
                        "role": item.get("role", "user"),
                        "content": item.get("content", ""),
                    }
                )

        # Add current question with context
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


# Singleton instance
bedrock_service = BedrockService()


def get_ai_service() -> AIService:
    """Get the AI service instance."""
    return bedrock_service
