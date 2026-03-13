# Notes Backend API

FastAPI backend for the Notes application.

## Responsibilities

- Cognito-backed authentication and app-user resolution
- note, folder, settings, share, admin, image, and MCP APIs
- AI summarize/chat/edit orchestration
- DSQL-aware persistence and schema bootstrap
- Lambda and worker entry points

## Current Structure

- `app/routers`: HTTP layer only
- `app/services`: use-case orchestration
- `app/repositories`: user-scoped persistence for DSQL-backed entities
- `app/core/persistence.py`: shared DSQL-friendly repository helpers
- `app/bootstrap`: runtime schema/bootstrap helpers
- `app/auth`: Cognito verification and app-user dependencies

## DSQL Constraints

Aurora DSQL is a hard requirement. Backend changes must preserve these assumptions:

- no foreign keys
- manual UUID generation
- `user_id`-scoped ownership checks
- soft deletes where sync or recovery needs them
- bootstrap behavior that works in Lambda-style runtime entry points

The reasoning is documented in:

- [`docs/adr/0001-dsql-persistence-boundaries.md`](/home/ttakahashi/workspace/notes/docs/adr/0001-dsql-persistence-boundaries.md)
- [`docs/adr/0002-dsql-runtime-bootstrap.md`](/home/ttakahashi/workspace/notes/docs/adr/0002-dsql-runtime-bootstrap.md)

## Development

Use root `make` targets for normal workflows.

```bash
# Backend unit tests
make test-backend

# High-value backend contract regressions
make test-app-contracts

# AI regression checks
make test-ai-regression

# Backend lint
make lint-backend
```

For backend-local debugging:

```bash
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

## Database Migrations

Schema changes are managed with Alembic.

```bash
uv run alembic revision --autogenerate -m "add_new_column"
uv run alembic upgrade head
```

Databases created before Alembic adoption are bootstrapped once by the app and then stamped to the current head revision. On DSQL deployments that bootstrap path is still runtime behavior, but it is isolated under `app/bootstrap`.

## API Documentation

Once running:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://notes:notes@localhost:5432/notes` |
| `DSQL_CLUSTER_ENDPOINT` | Aurora DSQL cluster identifier for IAM-authenticated connections | - |
| `COGNITO_REGION` | AWS Cognito region | `ap-northeast-1` |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID | - |
| `COGNITO_APP_CLIENT_ID` | Cognito App Client ID | - |
| `BEDROCK_REGION` | AWS Bedrock region | `us-east-1` |
| `BEDROCK_MODEL_ID` | Bedrock model ID | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| `SENTRY_DSN` | Local-only Sentry DSN loaded from `.env` | - |
| `SENTRY_DSN_PARAMETER_NAME` | Backend AWS SSM SecureString parameter name used outside local development | - |
| `SENTRY_TRACES_SAMPLE_RATE` | Optional trace sample rate override | `1.0` in `local`/`dev`, `0.1` otherwise |

For AWS environments, register the backend DSN in Parameter Store and keep the Lambda config on the parameter name:

```bash
make put-sentry-dsn-backend ENV=dev SENTRY_DSN='https://...'
```
