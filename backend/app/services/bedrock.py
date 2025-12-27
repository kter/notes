import json
from abc import ABC, abstractmethod

import boto3

from app.config import get_settings
from app.core.prompts import (
    CHAT_SYSTEM_PROMPT,
    GENERATE_TITLE_SYSTEM_PROMPT,
    SUMMARIZE_SYSTEM_PROMPT,
)

settings = get_settings()


class AIService(ABC):
    """Abstract base class for AI services. Designed for future RAG extensibility."""

    @abstractmethod
    async def summarize(self, content: str, model_id: str | None = None) -> str:
        """Generate a summary of the given content."""
        pass

    @abstractmethod
    async def chat(
        self, content: str, question: str, history: list[dict] | None = None, model_id: str | None = None
    ) -> str:
        """Answer a question based on the given content context."""
        pass

    @abstractmethod
    async def generate_title(self, content: str, model_id: str | None = None) -> str:
        """Generate a concise title for the given content."""
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
        self, messages: list[dict], system: str | None = None, model_id: str | None = None
    ) -> str:
        """Invoke the Bedrock model and return the response text."""
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
        return response_body["content"][0]["text"]

    async def summarize(self, content: str, model_id: str | None = None) -> str:
        """Generate a summary of the note content."""
        system = SUMMARIZE_SYSTEM_PROMPT

        messages = [
            {
                "role": "user",
                "content": f"Please summarize the following note:\n\n{content}",
            }
        ]

        return self._invoke_model(messages, system, model_id=model_id)

    async def generate_title(self, content: str, model_id: str | None = None) -> str:
        """Generate a concise title for the note content."""
        system = GENERATE_TITLE_SYSTEM_PROMPT

        messages = [
            {
                "role": "user",
                "content": f"Generate a concise title for this note:\n\n{content}",
            }
        ]

        return self._invoke_model(messages, system, model_id=model_id).strip()

    async def chat(
        self, content: str, question: str, history: list[dict] | None = None, model_id: str | None = None
    ) -> str:
        """Answer a question about the note content."""
        system = CHAT_SYSTEM_PROMPT

        # Build context message
        context_message = f"Here is the note content:\n\n{content}\n\n---\n\n"

        messages = []

        # Add conversation history if provided
        if history:
            for item in history:
                messages.append({
                    "role": item.get("role", "user"),
                    "content": item.get("content", ""),
                })

        # Add current question with context
        messages.append({
            "role": "user",
            "content": (
                context_message + f"Question: {question}"
                if not history
                else f"Question: {question}"
            ),
        })

        return self._invoke_model(messages, system, model_id=model_id)


# Singleton instance
bedrock_service = BedrockService()


def get_ai_service() -> AIService:
    """Get the AI service instance."""
    return bedrock_service
