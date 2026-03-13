# Notes Frontend

Next.js App Router frontend for the Notes application.

## Responsibilities

- authenticated workspace composition
- local note editing and optimistic updates
- offline persistence with IndexedDB
- debounced note sync and pending queue handling
- AI chat and edit interactions
- admin and shared-note surfaces

## Current Structure

- `src/app`: route entry points
- `src/components/workspace`: authenticated workspace composition
- `src/hooks/workspace`: workspace-level orchestration
- `src/lib/sync`: note sync engine and sync helpers
- `src/hooks`: UI-facing hooks that bind app state to components
- `src/locales`: user-facing text definitions

## Frontend Boundaries

- Keep user-facing text in i18n files, not inline in components or hooks.
- Keep page files thin; workspace orchestration belongs in hooks/components under `workspace`.
- Keep sync protocol details in `src/lib/sync` or `src/lib/syncQueue`, not directly in page components.
- When adding tests for internal refactors, prefer focused regression coverage for workspace state and sync behavior.

## Common Workflows

Run frontend commands from the repository root unless you are debugging locally.

```bash
# Frontend unit tests
make test-frontend

# Sync/offline regression checks
make test-sync

# Frontend lint
make lint-frontend

# Frontend dev server
make dev-frontend
```

## Environment

Required local environment variables:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ENVIRONMENT=dev
```

For E2E:

```env
E2E_TEST_USER_EMAIL=your-test-user@example.com
E2E_TEST_USER_PASSWORD=YourTestPassword123!
```

Additional E2E setup details live in [`frontend/docs/E2E_CREDENTIALS.md`](/home/ttakahashi/workspace/notes/frontend/docs/E2E_CREDENTIALS.md).
