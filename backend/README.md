# Notes Backend API

Mac Notes Clone backend API built with FastAPI.

## Development

### Prerequisites
- Python 3.12+
- uv package manager
- PostgreSQL (via Docker for local development)

### Setup

```bash
# Install dependencies
uv sync

# Apply database migrations
uv run alembic upgrade head

# Run development server
uv run uvicorn app.main:app --reload
```

### Database Migrations

Schema changes are now managed with Alembic.

```bash
# Create a new revision from model changes
uv run alembic revision --autogenerate -m "add_new_column"

# Apply pending migrations
uv run alembic upgrade head
```

Databases created before Alembic adoption are bootstrapped once by the app and then stamped to the current head revision.

### API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://notes:notes@localhost:5432/notes` |
| `COGNITO_REGION` | AWS Cognito region | `ap-northeast-1` |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID | - |
| `COGNITO_APP_CLIENT_ID` | Cognito App Client ID | - |
| `BEDROCK_REGION` | AWS Bedrock region | `us-east-1` |
| `BEDROCK_MODEL_ID` | Bedrock model ID | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
