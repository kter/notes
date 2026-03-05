---
name: test-implementation
description: Implement unit tests and integration tests following best practices for web backends (FastAPI, Express, Django, etc.). Use this skill whenever the user asks to write tests, add test coverage, implement integration tests, write unit tests, improve test quality, check test best practices, or test a new feature or API endpoint. Also trigger when the user describes a testing gap, mentions that tests are missing, or wants to verify behavior of deployed services against a real API.
---

# Test Implementation

This skill helps you implement high-quality unit tests and integration tests. The goal is tests that are reliable, independent, and actually catch bugs — not tests that just pass green.

## Step 1: Understand what needs testing

Before writing any code, explore the codebase and answer:
- What features exist and which are already tested?
- What are the key happy paths and error paths?
- Which scenarios are too expensive/slow to test against real infrastructure (e.g., rate limits, payment failures, external service quotas)?
- Which scenarios require a real deployed environment to verify end-to-end behavior?

This determines the split between unit tests and integration tests.

## Step 2: Decide unit test vs integration test

**Use unit tests when:**
- The scenario would require special conditions that are costly or impractical to trigger in a real environment (hitting token/rate limits, triggering billing events, 3rd-party API failures)
- The logic is pure business logic with injectable dependencies (you can pass in a fake DB session or mock service)
- You need to test boundary values precisely (e.g., exactly at a limit, one above, one below)

**Use integration tests when:**
- You want to verify the full request/response cycle against a real deployed service
- The feature involves infrastructure (DB reads/writes, cache, auth, file storage)
- You need to confirm that components work together correctly (not just in isolation)

## Step 3: Unit test patterns

### Mocking dependencies

The key pattern for unit tests is dependency injection + mocking. If the code under test takes a `session` or `client` parameter, you can pass a mock instead of a real DB/API connection.

```python
from unittest.mock import MagicMock

def _make_session(return_value):
    mock_session = MagicMock()
    mock_session.exec.return_value.first.return_value = return_value
    return mock_session
```

### Boundary value testing

For any limit-based logic, always test these four cases:
- `limit - 1` (just under: should pass)
- `limit` (exactly at: depends on business logic — clarify with the codebase)
- `limit + 1` (just over: should fail)
- `0` (zero: edge case)

### Test both branches

For every function that can raise an exception or return an error, write a test for the success path AND the failure path. Don't just test the happy path.

```python
def test_raises_429_when_limit_exceeded(self):
    session = _make_session(over_limit_value)
    with self.assertRaises(HTTPException) as ctx:
        _check_limit(session, "user-id")
    self.assertEqual(ctx.exception.status_code, 429)

def test_no_exception_when_within_limit(self):
    session = _make_session(under_limit_value)
    _check_limit(session, "user-id")  # Should not raise
```

## Step 4: Integration test patterns

### Project structure

```
tests/integration/
├── conftest.py          # Shared fixtures (client, auth, base URL)
├── test_<feature>.py    # One file per feature area
└── ...
```

### conftest.py: shared fixtures

The conftest should define session-scoped fixtures for the API URL and auth tokens (these don't change per test), and function-scoped fixtures for the HTTP client:

```python
@pytest.fixture(scope="session")
def api_base_url():
    return os.getenv("API_URL", DEFAULT_API_URL)

@pytest.fixture(scope="session")
def auth_token():
    return "dev-integration-test-token"  # or from env

@pytest.fixture
def client(api_base_url, auth_token):
    headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    with httpx.Client(base_url=api_base_url, headers=headers, timeout=30.0) as client:
        yield client

@pytest.fixture
def another_client(api_base_url):
    """Second user client — for authorization tests."""
    headers = {"Authorization": "Bearer dev-integration-test-token-2", ...}
    with httpx.Client(base_url=api_base_url, headers=headers, timeout=30.0) as client:
        yield client
```

### Fixture with cleanup (yield pattern)

Every fixture that creates data must delete it afterward. Use `yield` to ensure cleanup runs even when the test fails:

```python
@pytest.fixture
def test_note(self, client):
    response = client.post("/api/notes", json={"title": "Test Note", "content": "..."})
    assert response.status_code == 201
    note = response.json()
    yield note
    client.delete(f"/api/notes/{note['id']}")  # always runs
```

### Cleanup independence with try/finally

When a test itself creates resources (not via a fixture), wrap the cleanup in `try/finally` so that a failed assertion doesn't skip cleanup:

```python
def test_create_and_verify(self, client, test_resource):
    resource_id = test_resource["id"]
    extra_response = client.post(f"/api/resource/{resource_id}/extra")
    try:
        assert extra_response.status_code == 201
        data = extra_response.json()
        assert "id" in data
    finally:
        client.delete(f"/api/resource/{resource_id}/extra")
```

### Prevent cross-test cache pollution

If your service caches responses (e.g., AI summaries cached by content hash in S3), use unique content per test to avoid one test getting a cache hit from a previous test's data:

```python
@pytest.fixture
def test_note(self, client):
    unique_id = str(uuid.uuid4())  # embed UUID to make content unique
    content = f"Unique test content [{unique_id}]. Regular content follows..."
    response = client.post("/api/notes", json={"title": "Test", "content": content})
    ...
```

### Label test data

Use a recognizable prefix so you can identify and clean up orphaned test data:

```python
TEST_PREFIX = "[IntegrationTest]"

def generate_title(base):
    return f"{TEST_PREFIX} {base} {datetime.datetime.now().isoformat()}"
```

### Test 404 for nonexistent resources

Always verify that your API correctly returns 404 for resources that don't exist, not a 500 or a 200 with empty data:

```python
def test_get_nonexistent(self, client):
    fake_id = str(uuid.uuid4())
    response = client.get(f"/api/resource/{fake_id}")
    assert response.status_code == 404
```

## Step 5: Authorization testing

Cross-user authorization tests are critical for any multi-tenant system. Verify that user A cannot access user B's resources:

```python
class TestCrossUserAuthorization:
    @pytest.fixture
    def user_a_resource(self, client):
        """Creates a resource as user A."""
        response = client.post("/api/resource", json={"name": "User A's resource"})
        assert response.status_code == 201
        resource = response.json()
        yield resource
        client.delete(f"/api/resource/{resource['id']}")

    def test_cannot_read_other_users_resource(self, another_client, user_a_resource):
        """User B should get 404 when trying to read User A's resource."""
        response = another_client.get(f"/api/resource/{user_a_resource['id']}")
        assert response.status_code == 404  # not 403 — don't leak existence

    def test_cannot_update_other_users_resource(self, another_client, user_a_resource):
        response = another_client.put(
            f"/api/resource/{user_a_resource['id']}", json={"name": "Hijacked"}
        )
        assert response.status_code == 404

    def test_cannot_delete_other_users_resource(self, another_client, user_a_resource):
        response = another_client.delete(f"/api/resource/{user_a_resource['id']}")
        assert response.status_code == 404

    def test_resources_are_isolated_between_users(self, client, another_client, user_a_resource):
        """User A's resource should not appear in User B's list."""
        response = another_client.get("/api/resource")
        assert response.status_code == 200
        ids = [r["id"] for r in response.json()]
        assert user_a_resource["id"] not in ids
```

For this to work, you need a second auth token set up in your auth layer. In dev/test environments, a backdoor bypass (token → user mapping) is a clean way to do this without real OAuth flows.

## Step 6: Best practices checklist

Before considering tests done, verify:

- [ ] Every fixture that creates data has cleanup in `yield` or `try/finally`
- [ ] Fixtures that use cached external services embed a UUID in their data
- [ ] All happy paths tested
- [ ] All expected error paths tested (404, 401, 403, 422, etc.)
- [ ] Authorization: user A cannot access user B's resources (GET, PUT, DELETE)
- [ ] Boundary values tested for any limit-based logic
- [ ] Unit tests for scenarios that can't be triggered via real API
- [ ] Test data uses a recognizable prefix
- [ ] No test depends on the side effects of another test (each test is independent)

## What to output

For each feature area, produce:
1. A test file with clearly named test classes and test methods
2. Any updates needed to `conftest.py` (new fixtures)
3. Any backend changes needed to support test tokens/bypasses in dev environments
4. A brief explanation of which tests cover which scenarios and why they're structured that way
