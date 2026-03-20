TOKEN_LIMIT_EXCEEDED_MESSAGE = "Monthly token limit exceeded. Your usage will reset at the beginning of next month."  # noqa: S105
AI_TIMEOUT_MESSAGE = (
    "AI request timed out. Try a shorter note or edit a smaller section."
)
AI_EDIT_JOB_TIMEOUT_MESSAGE = "AI request timed out. Try editing a smaller section."


class AITokenLimitExceededError(RuntimeError):
    """Raised when a user has no remaining AI quota."""


class AIApplicationTimeoutError(RuntimeError):
    """Raised when the upstream AI provider times out."""
