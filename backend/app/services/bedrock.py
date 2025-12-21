import json
from abc import ABC, abstractmethod

import boto3

from app.config import get_settings

settings = get_settings()


class AIService(ABC):
    """Abstract base class for AI services. Designed for future RAG extensibility."""

    @abstractmethod
    async def summarize(self, content: str) -> str:
        """Generate a summary of the given content."""
        pass

    @abstractmethod
    async def chat(self, content: str, question: str, history: list[dict] | None = None) -> str:
        """Answer a question based on the given content context."""
        pass


class BedrockService(AIService):
    """Amazon Bedrock service using Claude."""

    def __init__(self):
        self.client = boto3.client(
            "bedrock-runtime",
            region_name=settings.bedrock_region,
        )
        self.model_id = settings.bedrock_model_id

    def _invoke_model(self, messages: list[dict], system: str | None = None) -> str:
        """Invoke the Bedrock model and return the response text."""
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "messages": messages,
        }

        if system:
            body["system"] = system

        response = self.client.invoke_model(
            modelId=self.model_id,
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json",
        )

        response_body = json.loads(response["body"].read())
        return response_body["content"][0]["text"]

    async def summarize(self, content: str) -> str:
        """Generate a summary of the note content."""
        system = (
            "You are a helpful assistant that summarizes notes. "
            "Provide a concise, well-structured summary that captures the key points. "
            "Use bullet points for multiple topics. Keep the summary brief but informative."
        )

        messages = [
            {
                "role": "user",
                "content": f"Please summarize the following note:\n\n{content}",
            }
        ]

        return self._invoke_model(messages, system)

    async def chat(
        self, content: str, question: str, history: list[dict] | None = None
    ) -> str:
        """Answer a question about the note content."""
        system = (
            "You are a helpful assistant that answers questions about notes. "
            "Base your answers on the provided note content. "
            "If the answer cannot be found in the note, say so clearly. "
            "Be concise and helpful."
        )

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

        return self._invoke_model(messages, system)


# Singleton instance
bedrock_service = BedrockService()


def get_ai_service() -> AIService:
    """Get the AI service instance."""
    return bedrock_service
