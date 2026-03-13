# Re-Architecture Blueprint

## Goal

Redesign the application without changing the AWS topology:

- frontend stays on S3 + CloudFront
- auth stays on Cognito
- API stays on API Gateway HTTP API + Lambda container + FastAPI
- primary database stays on Aurora DSQL
- long-running AI work stays on SNS/SQS + worker Lambda
- image and AI cache storage stay on S3

The target shape is a modular monolith with a first-class sync model.

## Design Priorities

1. Treat sync as a core product capability, not as a UI implementation detail.
2. Split code by feature boundary before splitting by technical layer.
3. Keep DSQL constraints inside persistence adapters.
4. Keep HTTP concerns at the edge of the backend.
5. Keep AI execution transport concerns separate from AI use cases.

## Target Context Map

The system is organized into these feature boundaries:

- `workspace`
  Notes, folders, editor save flow, export, snapshot loading, change application.
- `assistant`
  Summarize, chat, edit, async edit jobs, quota checks, context assembly.
- `identity_admin`
  App user projection, admin role checks, token usage policy, user settings.
- `sharing`
  Public share links and shared-note read surface.
- `media`
  Image upload and media metadata.
- `mcp`
  MCP token lifecycle and MCP settings.

## Backend Target Structure

```text
backend/app/
  main.py
  lambda_handler.py
  worker_lambda_handler.py
  bootstrap/
    database_bootstrap.py
  shared/
    errors.py
    time.py
    ids.py
    types.py
  infrastructure/
    auth/
      cognito.py
      dependencies.py
    persistence/
      dsql_engine.py
      unit_of_work.py
      ownership.py
      note_store.py
      folder_store.py
      app_user_store.py
      settings_store.py
      share_store.py
      ai_job_store.py
    ai/
      bedrock_gateway.py
      prompt_loader.py
    queue/
      edit_job_dispatcher.py
      edit_job_consumer.py
    cache/
      summary_cache.py
    media/
      image_storage.py
  features/
    workspace/
      router.py
      schemas.py
      use_cases/
        get_snapshot.py
        apply_changes.py
        export_notes.py
      services/
        conflict_resolver.py
      policies/
        note_policy.py
    assistant/
      router.py
      schemas.py
      use_cases/
        summarize_note.py
        chat_with_context.py
        submit_edit.py
        get_edit_job.py
      services/
        context_assembler.py
        quota_policy.py
    identity_admin/
      router.py
      schemas.py
      use_cases/
        get_current_admin.py
        list_users.py
        update_user.py
        get_settings.py
        update_settings.py
    sharing/
      router.py
      schemas.py
      use_cases/
        create_share.py
        get_share.py
        revoke_share.py
        get_shared_note.py
    media/
      router.py
      schemas.py
      use_cases/
        upload_image.py
    mcp/
      router.py
      schemas.py
      use_cases/
        create_token.py
        list_tokens.py
        revoke_token.py
        restore_token.py
```

## Backend Rules

- Routers only parse requests, resolve dependencies, call use cases, and map errors to HTTP status codes.
- Use cases return domain models or raise domain errors.
- Persistence adapters know about DSQL limitations, ownership checks, manual UUIDs, optimistic versioning, and soft deletes.
- Shared helpers cannot expose `HTTPException`.
- Worker Lambda calls the same assistant use cases as the synchronous HTTP path.

## Domain Error Model

`backend/app/shared/errors.py`

```python
class DomainError(Exception):
    pass


class NotFound(DomainError):
    pass


class Forbidden(DomainError):
    pass


class ConflictDetected(DomainError):
    pass


class QuotaExceeded(DomainError):
    pass


class ValidationFailed(DomainError):
    pass


class ShareExpired(DomainError):
    pass
```

Suggested HTTP mapping:

- `NotFound` -> `404`
- `Forbidden` -> `403`
- `ConflictDetected` -> `409`
- `QuotaExceeded` -> `429`
- `ValidationFailed` -> `400`
- `ShareExpired` -> `410`

## Data Model Changes

All user-owned workspace entities should support optimistic sync and soft delete.

### Folders

```text
folders
- id uuid pk
- user_id text
- name text
- version bigint
- created_at timestamptz
- updated_at timestamptz
- deleted_at timestamptz null
```

### Notes

```text
notes
- id uuid pk
- user_id text
- folder_id uuid null
- title text
- content text
- version bigint
- created_at timestamptz
- updated_at timestamptz
- deleted_at timestamptz null
```

### Applied Mutations

Used for idempotent change application from web clients and offline replay.

```text
applied_mutations
- user_id text
- client_mutation_id text
- entity_type text
- entity_id uuid
- result_version bigint
- applied_at timestamptz
```

### Workspace Changes

Optional but recommended if incremental pull is needed beyond full snapshot reloads.

```text
workspace_changes
- id uuid pk
- user_id text
- entity_type text
- entity_id uuid
- operation text
- entity_version bigint
- occurred_at timestamptz
```

### Existing Tables

- `ai_edit_jobs` remains, but becomes part of the `assistant` boundary.
- `app_users`, `user_settings`, `note_shares`, `mcp_tokens` remain valid and should gradually adopt the same error and persistence conventions.

## API Direction

Keep simple CRUD routes during migration, but move the frontend primary path to snapshot and change APIs.

### `GET /api/workspace/snapshot`

Purpose:

- load folders and notes together
- include soft-deleted records if client needs tombstone reconciliation
- return a cursor for future incremental sync

Response:

```json
{
  "cursor": "2026-03-14T10:00:00Z:42",
  "server_time": "2026-03-14T10:00:00Z",
  "folders": [
    {
      "id": "folder-uuid",
      "name": "Inbox",
      "version": 3,
      "created_at": "2026-03-01T00:00:00Z",
      "updated_at": "2026-03-10T00:00:00Z",
      "deleted_at": null
    }
  ],
  "notes": [
    {
      "id": "note-uuid",
      "folder_id": "folder-uuid",
      "title": "Draft",
      "content": "Hello",
      "version": 8,
      "created_at": "2026-03-01T00:00:00Z",
      "updated_at": "2026-03-12T00:00:00Z",
      "deleted_at": null
    }
  ]
}
```

### `POST /api/workspace/changes`

Purpose:

- apply multiple local changes in one request
- support optimistic concurrency
- support idempotency
- reduce Lambda round trips

Request:

```json
{
  "device_id": "web-chrome-1",
  "base_cursor": "2026-03-14T10:00:00Z:42",
  "changes": [
    {
      "client_mutation_id": "m_001",
      "entity_type": "note",
      "operation": "update",
      "entity_id": "note-uuid",
      "expected_version": 8,
      "payload": {
        "title": "Draft v2",
        "content": "Updated text"
      }
    },
    {
      "client_mutation_id": "m_002",
      "entity_type": "folder",
      "operation": "create",
      "entity_id": "temp-folder-1",
      "expected_version": null,
      "payload": {
        "name": "Ideas"
      }
    }
  ]
}
```

Response:

```json
{
  "cursor": "2026-03-14T10:01:00Z:49",
  "applied": [
    {
      "client_mutation_id": "m_001",
      "entity_type": "note",
      "entity_id": "note-uuid",
      "version": 9
    },
    {
      "client_mutation_id": "m_002",
      "entity_type": "folder",
      "temp_entity_id": "temp-folder-1",
      "entity_id": "real-folder-uuid",
      "version": 1
    }
  ],
  "conflicts": [],
  "patch": {
    "folders": [],
    "notes": []
  }
}
```

Conflict example:

```json
{
  "cursor": "2026-03-14T10:01:00Z:49",
  "applied": [],
  "conflicts": [
    {
      "client_mutation_id": "m_001",
      "entity_type": "note",
      "entity_id": "note-uuid",
      "reason": "version_mismatch",
      "server_entity": {
        "id": "note-uuid",
        "version": 10,
        "title": "Server title",
        "content": "Server content",
        "updated_at": "2026-03-14T10:00:30Z",
        "deleted_at": null
      }
    }
  ],
  "patch": {
    "folders": [],
    "notes": []
  }
}
```

### `GET /api/assistant/edit-jobs/{job_id}`

Keep polling for now because the AWS topology already includes SQS and worker Lambda.

Recommended response shape:

```json
{
  "id": "job-uuid",
  "status": "pending",
  "result": null,
  "error": null,
  "started_at": null,
  "completed_at": null
}
```

### `POST /api/assistant/edit-requests`

Recommended request:

```json
{
  "note_id": "note-uuid",
  "content": "Current editor content",
  "instruction": "Make this more concise"
}
```

Recommended behavior:

- short inputs may complete inline
- long inputs create an async job and return `202`
- the same use case decides whether to run sync or async

## Frontend Target Structure

```text
frontend/src/
  app/
    page.tsx
    admin/page.tsx
    shared/page.tsx
  shells/
    workspace/
      WorkspaceShell.tsx
    admin/
      AdminShell.tsx
    shared/
      SharedViewerShell.tsx
  features/
    workspace/
      components/
      stores/
        workspaceStore.ts
        editorBufferStore.ts
        syncStore.ts
      api/
        workspaceApi.ts
      local/
        workspaceDb.ts
        outbox.ts
      sync/
        applyPatch.ts
        conflictResolution.ts
        hydration.ts
    assistant/
      components/
      stores/
        assistantStore.ts
      api/
        assistantApi.ts
      polling/
        editJobPoller.ts
    identity/
      stores/
        sessionStore.ts
      api/
        authApi.ts
    admin/
      components/
      stores/
        adminStore.ts
      api/
        adminApi.ts
    sharing/
      components/
      api/
        shareApi.ts
    mcp/
      components/
      api/
        mcpApi.ts
  shared/
    i18n/
    http/
    ui/
    types/
```

## Frontend State Model

### `sessionStore`

- current user
- auth loading
- token getter
- sign in and sign out

### `workspaceStore`

- selected folder id
- selected note id
- search query
- sidebar and note list visibility
- mobile view

### `editorBufferStore`

- in-memory content buffer
- dirty state
- last synced version
- last saved hash
- content override after AI accept

### `syncStore`

- snapshot hydration
- local IndexedDB state
- outbox mutation queue
- flush lifecycle
- conflict handling
- temp id replacement

### `assistantStore`

- chat history
- summarize state
- edit requests
- pending edit proposals
- edit job polling

## Frontend Rules

- Page files only select the shell to render.
- Shells compose feature components and stores.
- API modules are per feature, not one global client file.
- IndexedDB and outbox code live under the workspace feature, not under generic hooks.
- All user-facing text must stay in i18n files.

## Sync Algorithm

1. Load local snapshot from IndexedDB.
2. Render immediately.
3. Fetch server snapshot.
4. Reconcile by `id + version + deleted_at`, not by `updated_at` alone.
5. Store server snapshot locally.
6. User edits write to local DB and append to outbox.
7. Background flush sends batched changes to `/api/workspace/changes`.
8. Applied mutations update local versions and replace temp ids.
9. Conflicts open a merge workflow in the editor instead of silently overwriting.

## AI Interaction Model

1. Editor sends an edit request through `assistantStore`.
2. The assistant API decides sync vs async execution.
3. If async, store the job reference in `assistantStore`.
4. Poll through `editJobPoller`.
5. When complete, create an edit proposal rather than applying directly.
6. Only on explicit user acceptance does `syncStore` enqueue a note update mutation.

This keeps AI from bypassing the same sync and conflict path used by normal edits.

## Migration Plan

### Phase 1: Backend boundary cleanup

- move export logic out of routers
- remove `HTTPException` from repositories
- introduce shared domain errors
- group files by feature internally without changing HTTP contracts

### Phase 2: Add versioned persistence

- add `version` and `deleted_at` to folders and notes
- add `applied_mutations`
- update repositories to use optimistic version increments

### Phase 3: Introduce new sync APIs

- implement `GET /api/workspace/snapshot`
- implement `POST /api/workspace/changes`
- keep old CRUD routes temporarily for compatibility

### Phase 4: Frontend sync rewrite

- create `workspaceApi`, `workspaceDb`, and `syncStore`
- move hydration and flush logic out of UI hooks
- remove `updated_at`-only merge logic

### Phase 5: AI store rewrite

- move edit job polling out of `useAIChat`
- route AI-accepted edits through the same outbox as manual edits

### Phase 6: Remove compatibility paths

- deprecate old note CRUD usage in the main workspace client
- simplify `useWorkspaceState` into shell-level composition or remove it entirely

## Non-Goals

- no change to the AWS topology
- no move to microservices
- no websocket requirement
- no server-rendered private workspace requirement

## Success Criteria

- the main workspace can be reasoned about as `snapshot + local mutations + sync flush`
- AI edits follow the same acceptance and sync path as manual edits
- routers no longer contain persistence logic
- persistence code no longer throws HTTP-layer exceptions
- new features can be added inside a single feature module without touching multiple cross-cutting top-level folders
