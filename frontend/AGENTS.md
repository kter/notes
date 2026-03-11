# AGENTS.md

## Scope

Instructions for work under `frontend/`.

Inherit the repository-level guidance from the parent `AGENTS.md`. When frontend-specific guidance conflicts with parent guidance, this file takes precedence.

## Command Policy

- Prefer root `make` targets for routine workflows.
- Common entry points: `make dev-frontend`, `make test-frontend`, `make lint-frontend`, `make test-e2e ENV=dev`.
- Use direct `npm` or `playwright` commands only for frontend-local debugging that is not exposed via the root `Makefile`.

## Environment

Required `.env.local` keys:
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_ENVIRONMENT`

Required for E2E:
- `E2E_TEST_USER_EMAIL`
- `E2E_TEST_USER_PASSWORD`

## Frontend Notes

- Frontend uses Next.js App Router.
- Authentication is handled with Amplify and Cognito.
- Keep all user-facing text wired through i18n.
