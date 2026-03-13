# ADR 0002: Runtime Bootstrap for DSQL

## Status

Accepted

## Context

Aurora DSQL has migration and DDL constraints that differ from a conventional long-lived PostgreSQL deployment. This application also runs in Lambda-style environments where the first request or cold start may be the first chance to ensure schema/bootstrap state.

Previously, schema initialization and migration recovery behavior were mixed into generic database modules and request startup paths, which made the app harder to reason about.

## Decision

We isolate bootstrap behavior into dedicated modules while keeping the runtime capability.

- Database engine and session setup remain in [`backend/app/database.py`](/home/ttakahashi/workspace/notes/backend/app/database.py).
- Schema bootstrap, Alembic stamping, and first-request initialization live in [`backend/app/bootstrap/database_bootstrap.py`](/home/ttakahashi/workspace/notes/backend/app/bootstrap/database_bootstrap.py).
- App startup and Lambda handlers call bootstrap helpers instead of owning the policy directly.

Current reference points:

- [`backend/app/main.py`](/home/ttakahashi/workspace/notes/backend/app/main.py)
- [`backend/app/lambda_handler.py`](/home/ttakahashi/workspace/notes/backend/app/lambda_handler.py)
- [`backend/app/worker_lambda_handler.py`](/home/ttakahashi/workspace/notes/backend/app/worker_lambda_handler.py)

## Consequences

Positive:

- Runtime bootstrap remains available for DSQL deployments that need it.
- Initialization policy is easier to test in isolation.
- HTTP request code no longer carries schema-recovery details inline.

Tradeoffs:

- Startup flow is more indirect.
- Developers must understand that bootstrap is still runtime behavior, not just a local setup concern.

## Guardrails

- Do not reintroduce bootstrap policy into routers or unrelated services.
- Keep DSQL-specific migration compensation logic inside bootstrap modules.
- Test both first-request initialization and Lambda cold-start bootstrap behavior when modifying schema setup.
