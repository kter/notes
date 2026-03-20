"""MCP feature package."""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.features.mcp.use_cases import MCPUseCases

__all__ = ["MCPUseCases", "router"]


def __getattr__(name: str) -> Any:
    if name == "router":
        from app.features.mcp.router import router

        return router
    if name == "MCPUseCases":
        from app.features.mcp.use_cases import MCPUseCases

        return MCPUseCases
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
