"""Pytest configuration for MCP Server integration tests."""

import os


def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests (slow, requires AWS)"
    )


def pytest_collection_modifyitems(config, items):
    """Mark tests automatically based on patterns."""
    for item in items:
        # Mark tests in test_mcp_integration.py as integration tests
        if "test_mcp_integration" in item.fspath.strpath:
            item.add_marker("integration")
