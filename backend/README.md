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

# Run development server
uv run uvicorn app.main:app --reload
```

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
