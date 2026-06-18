"""Assistant use cases."""

from app.features.assistant.use_cases.ai_interactions import AIInteractionUseCases
from app.features.assistant.use_cases.ai_jobs import AIJobUseCases
from app.features.assistant.use_cases.edit_jobs import EditJobUseCases

__all__ = ["AIInteractionUseCases", "AIJobUseCases", "EditJobUseCases"]
