# Build stage - use a base image with build tools
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

# Copy dependency files first for better caching
COPY pyproject.toml uv.lock ./

# Install dependencies into default venv
RUN uv sync --frozen --no-dev

# Final stage - Lambda runtime only
FROM public.ecr.aws/lambda/python:3.12

# Copy installed dependencies directly from the venv
COPY --from=builder /.venv/lib/python3.12/site-packages /var/lang/lib/python3.12/site-packages

# Copy application code
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini

# Set the CMD to your handler
CMD ["app.lambda_handler.handler"]
