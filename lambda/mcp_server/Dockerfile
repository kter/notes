# Build stage - use a base image with build tools
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

# Copy dependency files first for better caching
COPY pyproject.toml uv.lock ./

# Install dependencies into default venv
RUN uv sync --frozen --no-dev

# Copy site-packages to staging directory
RUN cp -r /.venv/lib/python3.12/site-packages /install

# Final stage - Lambda runtime only
FROM public.ecr.aws/lambda/python:3.12

# Copy installed dependencies from builder stage
COPY --from=builder /install /var/lang/lib/python3.12/site-packages

# Copy application code
COPY app.py lambda_handler.py pyproject.toml /var/task/

# Set the Lambda handler
CMD ["lambda_handler.handler"]
