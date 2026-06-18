"""Assistant feature package."""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.features.assistant.use_cases import (
        AIInteractionUseCases,
        AIJobUseCases,
        EditJobUseCases,
    )

__all__ = [
    "AIInteractionUseCases",
    "AIJobUseCases",
    "EditJobUseCases",
    "dispatch_ai_job",
    "dispatch_edit_job",
    "process_chat_job",
    "process_edit_job",
    "process_summarize_job",
    "router",
    "run_edit_job_queue_records",
]


def __getattr__(name: str) -> Any:
    if name == "router":
        from app.features.assistant.router import router

        return router
    if name in {
        "dispatch_ai_job",
        "dispatch_edit_job",
        "process_chat_job",
        "process_edit_job",
        "process_summarize_job",
        "run_edit_job_queue_records",
    }:
        from app.features.assistant import job_runner

        return getattr(job_runner, name)
    if name in {"AIInteractionUseCases", "AIJobUseCases", "EditJobUseCases"}:
        from app.features.assistant import use_cases

        return getattr(use_cases, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
