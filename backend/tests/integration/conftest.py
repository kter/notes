import os

import httpx
import pytest

# Default to the dev URL integration testing if not provided
# I got this URL from `make tf-output` previously
DEFAULT_DEV_API_URL = "https://cmwds5zjfa.execute-api.ap-northeast-1.amazonaws.com"

@pytest.fixture(scope="session")
def api_base_url():
    """Get the API base URL from environment or default."""
    return os.getenv("API_URL", DEFAULT_DEV_API_URL)

@pytest.fixture(scope="session")
def auth_token():
    """Return the backdoor token for integration tests."""
    return "dev-integration-test-token"

@pytest.fixture(scope="session")
def test_user_id():
    """Return the user ID associated with the backdoor token."""
    return "integration-test-user-id"

@pytest.fixture
def client(api_base_url, auth_token):
    """
    Create an httpx Client authenticated with the backdoor token.
    This runs against the REAL, DEPLOYED backend.
    """
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
    }
    with httpx.Client(base_url=api_base_url, headers=headers, timeout=30.0) as client:
        yield client
