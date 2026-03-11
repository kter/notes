# AGENTS.md

## Scope

Instructions for work under `backend/`.

Inherit the repository-level guidance from the parent `AGENTS.md`. When backend-specific guidance conflicts with parent guidance, this file takes precedence.

## Command Policy

- Prefer root `make` targets for routine workflows.
- Common entry points: `make dev-backend`, `make test-backend`, `make lint-backend`, `make db-revision MESSAGE="..."`, `make db-upgrade`.
- Use direct `uv` commands only when working on backend internals that are not exposed via the root `Makefile`.

## Environment

Required `.env` keys:
- `DATABASE_URL`
- `COGNITO_USER_POOL_ID`
- `COGNITO_APP_CLIENT_ID`
- `BEDROCK_REGION`

## Backend Notes

- FastAPI runs in AWS Lambda Docker containers.
- Backend verifies Cognito JWTs and uses the `sub` claim as the user identity.
- Aurora DSQL constraints: no foreign keys, manual UUIDs, soft deletes, and `user_id`-based isolation on all models.
- Manage schema changes with Alembic revisions, not ad hoc SQL in startup code.
- Backend uses Pydantic v2.
- Async tests use `pytest-asyncio` with `asyncio_mode=auto`.
- Lambda container images must target `linux/amd64`.
- AI responses are cached in S3 and token usage is tracked.
