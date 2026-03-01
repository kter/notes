FROM public.ecr.aws/lambda/python:3.14

# Install system dependencies
RUN dnf install -y gcc libpq && \
    dnf clean all && \
    rm -rf /var/cache/dnf

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code to Lambda working directory
COPY . /var/task/

# Set the Lambda handler
# For Lambda Python base image, the handler format is: module_name.handler
CMD ["lambda_handler.handler"]
