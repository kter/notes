class DomainError(Exception):
    """Base class for domain-layer failures."""

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class NotFound(DomainError):
    """Raised when a resource does not exist in the caller's scope."""


class Forbidden(DomainError):
    """Raised when a user cannot perform an action."""


class ConflictDetected(DomainError):
    """Raised when optimistic writes or uniqueness guarantees fail."""


class QuotaExceeded(DomainError):
    """Raised when a caller exceeds a quota or limit."""


class ValidationFailed(DomainError):
    """Raised when a request is semantically invalid."""


class ShareExpired(DomainError):
    """Raised when a shared resource has expired."""
