FROM public.ecr.aws/lambda/python:3.12

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy project files
COPY pyproject.toml uv.lock ./
COPY app ./app

# Install dependencies using uv
RUN uv pip install --system --no-cache -e .

# Install mangum for Lambda adapter
RUN uv pip install --system --no-cache mangum

# Set the CMD to your handler
CMD ["app.lambda_handler.handler"]
