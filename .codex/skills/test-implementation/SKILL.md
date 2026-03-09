---
name: test-implementation
description: Implement unit tests and integration tests for backend and API features. Use this skill when the user asks to add tests, improve coverage, write unit or integration tests, close testing gaps, validate backend behavior, or verify deployed services against a real API.
---

# Test Implementation

Implement tests that are reliable, independent, and targeted at real failure modes.

## Workflow

1. Inspect the feature and existing tests before writing code.
2. Decide which cases belong in unit tests and which require integration tests.
3. Prefer dependency injection and mocks for business logic and hard-to-trigger failures.
4. Use integration tests for real request/response paths, auth, storage, and service wiring.
5. Add cleanup for every created resource.

## Unit tests

Use unit tests when:

- the behavior depends on boundary values
- external failures are expensive or impractical to trigger for real
- dependencies can be injected and mocked cleanly

Minimum coverage pattern:

- success path
- expected failure path
- boundary values: `limit - 1`, `limit`, `limit + 1`, and `0` when relevant

## Integration tests

Use integration tests when:

- the full HTTP flow matters
- auth, database, cache, or file storage are involved
- cross-component wiring needs verification

Recommended structure:

```text
tests/integration/
├── conftest.py
├── test_<feature>.py
└── ...
```

Fixture rules:

- session-scoped fixtures for stable config such as base URL and auth tokens
- function-scoped fixtures for clients and created resources
- resource-creating fixtures must clean up with `yield`
- ad hoc resource creation inside tests should use `try/finally`

## Critical scenarios

Always look for:

- happy path
- validation failures
- missing resource `404`
- auth failures such as `401`, `403`, or tenant-isolated `404`
- cross-user access attempts for multi-tenant systems
- cache pollution caused by reused test data

## Data hygiene

- Prefix integration test data so orphaned records are easy to find.
- Make cached-content fixtures unique with a UUID when collisions are possible.
- Keep tests independent; one test must not depend on another test's side effects.

## Output

For each feature area, produce:

1. the new or updated test file
2. any required `conftest.py` fixture changes
3. backend support changes needed for test auth or setup
4. a short explanation of what the tests cover and why
