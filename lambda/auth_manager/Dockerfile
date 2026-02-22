FROM public.ecr.aws/lambda/python:3.12

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set the Lambda handler
# AWS Lambda Python base image expects format: file_name.function_name
# where the file is in the working directory
CMD ["main.lambda_handler"]
