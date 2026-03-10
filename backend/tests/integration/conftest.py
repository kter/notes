import os

import httpx
import pytest

# Default to the dev URL integration testing if not provided
# I got this URL from `make tf-output` previously
DEFAULT_DEV_API_URL = "https://api.notes.dev.devtools.site"

# Token limit for integration test users (large enough to never hit in tests)
INTEGRATION_TEST_TOKEN_LIMIT = 10_000_000

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

@pytest.fixture(scope="session", autouse=True)
def set_integration_test_token_limits(api_base_url, auth_token):
    """
    Set a large token limit for integration test users at the start of the session.
    This prevents AI endpoint tests from hitting the monthly token limit.
    """
    for token in (auth_token, "dev-integration-test-token-2"):
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        with httpx.Client(base_url=api_base_url, headers=headers, timeout=30.0) as c:
            user_id = "integration-test-user-id" if token == auth_token else "integration-test-user-id-2"
            c.patch(
                f"/api/admin/users/{user_id}",
                json={"token_limit": INTEGRATION_TEST_TOKEN_LIMIT},
            )

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


@pytest.fixture
def another_client(api_base_url):
    """
    Create an httpx Client authenticated as a SECOND integration test user.
    Used to verify that user A cannot access user B's resources.
    """
    headers = {
        "Authorization": "Bearer dev-integration-test-token-2",
        "Content-Type": "application/json",
    }
    with httpx.Client(base_url=api_base_url, headers=headers, timeout=30.0) as client:
        yield client
