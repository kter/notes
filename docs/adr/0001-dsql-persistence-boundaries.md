# ADR 0001: DSQL Persistence Boundaries

## Status

Accepted

## Context

This application runs on Aurora DSQL and must preserve the following constraints across all backend changes:

- no foreign key constraints
- manual UUID generation
- `user_id`-based ownership and isolation
- soft deletes where recovery or eventual sync requires them
- compatibility with DSQL transaction and migration limitations

Earlier iterations let these rules leak into routers and ad hoc query code. That made ownership checks, timestamp updates, and DSQL-specific behavior easy to miss during feature work.

## Decision

We keep DSQL-specific persistence rules behind backend services and repositories.

- Routers stay responsible for HTTP input/output and dependency wiring.
- Services own use-case orchestration.
- Repositories own user-scoped queries, ownership checks, timestamp touching, and DSQL-friendly persistence behavior.
- Shared persistence helpers live in [`backend/app/core/persistence.py`](/home/ttakahashi/workspace/notes/backend/app/core/persistence.py).

Current reference points:

- [`backend/app/repositories/note_repository.py`](/home/ttakahashi/workspace/notes/backend/app/repositories/note_repository.py)
- [`backend/app/repositories/folder_repository.py`](/home/ttakahashi/workspace/notes/backend/app/repositories/folder_repository.py)
- [`backend/app/services/note_service.py`](/home/ttakahashi/workspace/notes/backend/app/services/note_service.py)
- [`backend/app/services/folder_service.py`](/home/ttakahashi/workspace/notes/backend/app/services/folder_service.py)

## Consequences

Positive:

- DSQL constraints are explicit and reusable instead of being re-implemented in each router.
- Cross-user access checks are easier to review and test.
- Future entities can follow the same repository/service shape.

Tradeoffs:

- Simple CRUD paths gain an extra layer.
- Repository abstractions must stay concrete and DSQL-oriented; generic ORM wrappers would hide important constraints.

## Guardrails

- Do not add new user-owned CRUD logic directly to routers.
- Do not rely on implicit foreign keys or database cascades.
- Keep ownership enforcement in repository or service code with tests.
- Add regression tests when introducing new repository helpers or entity repositories.
