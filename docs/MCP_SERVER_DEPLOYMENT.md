# MCP Server Deployment - Notes App

## Overview

Successfully implemented and deployed an AWS Cognito-authenticated MCP (Model Context Protocol) server for the Notes App with the following features:

- **SSE Transport**: Uses FastAPI with Mangum adapter for Lambda
- **JWT Authentication**: Verifies Cognito JWT tokens via JWKS
- **DSQL Integration**: IAM-authenticated Aurora DSQL database access
- **Multi-tenant Data Isolation**: Each user only sees their own notes
- **API Gateway Integration**: HTTP API Gateway for reliable access

## Deployment Status

✅ **Infrastructure**: All AWS resources deployed via Terraform
✅ **Lambda Function**: MCP Server Lambda deployed with Docker image
✅ **API Gateway**: HTTP API Gateway with $default stage
✅ **Authentication**: JWT token verification working correctly
✅ **Health Check**: `/health` endpoint responding correctly

## API Endpoint

The MCP Server is accessible at:
```
https://5gcqmlela7.execute-api.ap-northeast-1.amazonaws.com
```

## Available Endpoints

### Health Check
```bash
curl https://5gcqmlela7.execute-api.ap-northeast-1.amazonaws.com/health
```

Response:
```json
{"status":"ok","environment":"dev"}
```

### MCP SSE Endpoint
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <COGNITO_TOKEN>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/list","params":{}}' \
  https://5gcqmlela7.execute-api.ap-northeast-1.amazonaws.com/
```

## MCP Methods Implemented

### `resources/list`
Lists all notes as MCP resources for the authenticated user.

Request:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/list",
  "params": {}
}
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": [
    {
      "uri": "notes://<note-id>",
      "name": "Note Title",
      "description": "Note created at <timestamp>",
      "mimeType": "text/markdown"
    }
  ]
}
```

### `resources/read`
Reads the content of a specific note.

Request:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": {
    "uri": "notes://<note-id>"
  }
}
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "contents": [
      {
        "uri": "notes://<note-id>",
        "mimeType": "text/markdown",
        "text": "Note content here..."
      }
    ]
  }
}
```

## Authentication

The MCP server requires a valid Cognito JWT token in the `Authorization` header:

```
Authorization: Bearer <COGNITO_ID_TOKEN>
```

### Getting a Cognito Token

1. Sign in to the Notes App: https://notes.dev.devtools.site
2. Your browser will have access to the Cognito ID token
3. Use Developer Tools → Application → Local Storage to extract the token

Or use the Cognito API directly:
```bash
aws cognito-idp initiate-auth \
  --client-id 34ocbakt9u09i4p65hlnc5h6es \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=<email>,PASSWORD=<password> \
  --region ap-northeast-1 \
  --profile dev
```

## Architecture

```
┌─────────────┐
│   Client    │ (Claude Desktop)
└──────┬──────┘
       │ HTTP/HTTPS
       │ Authorization: Bearer <JWT>
       ▼
┌──────────────────────────────┐
│   API Gateway (HTTP API)   │
│   $default stage           │
└──────┬─────────────────────┘
       │ Lambda Proxy Integration
       ▼
┌──────────────────────────────┐
│   Lambda Function          │
│   - FastAPI + Mangum     │
│   - MCP Server           │
└──────┬─────────────────────┘
       │
       ├─► Cognito (JWT verification)
       │
       └─► Aurora DSQL (IAM auth)
           └─► Notes table (user_id filtered)
```

## Technical Details

### Lambda Configuration
- **Function Name**: `notes-app-mcp-server-dev`
- **Runtime**: Python 3.12 (Docker image)
- **Timeout**: 900 seconds (15 minutes)
- **Memory**: 1024 MB
- **Image URI**: `031921999648.dkr.ecr.ap-northeast-1.amazonaws.com/notes-app-mcp-server-dev:latest`

### IAM Permissions
The Lambda uses the `notes-app-backend-role-dev` role which has:
- DSQL Connect permissions (IAM authentication)
- Cognito JWKS fetching (internet access)
- CloudWatch Logs permissions

### Database Schema
The MCP server uses the existing `notes` table with:
- `id` (UUID)
- `title` (text)
- `content` (text)
- `user_id` (UUID) - for multi-tenant isolation
- `folder_id` (UUID, nullable)
- `created_at`, `updated_at` (timestamps)
- `deleted_at` (nullable, for soft deletes)

## Environment Variables

The Lambda function is configured with:
- `COGNITO_USER_POOL_ID`: Cognito User Pool ID
- `COGNITO_REGION`: AWS region for Cognito
- `DSQL_CLUSTER_ENDPOINT`: Aurora DSQL cluster identifier
- `ENVIRONMENT`: "dev"
- `JWT_ISSUER`: Cognito JWT issuer URL

## Troubleshooting

### Check Lambda Logs
```bash
aws logs tail /aws/lambda/notes-app-mcp-server-dev \
  --region ap-northeast-1 \
  --profile dev \
  --follow
```

### Test Lambda Directly
```bash
aws lambda invoke \
  --function-name notes-app-mcp-server-dev \
  --cli-binary-format raw-in-base64-out \
  --payload file://event.json \
  --region ap-northeast-1 \
  --profile dev \
  response.json
```

### Check API Gateway Logs
```bash
aws logs tail /aws/api-gateway/notes-app-mcp-server-dev \
  --region ap-northeast-1 \
  --profile dev \
  --follow
```

## Future Enhancements

1. **Additional MCP Methods**:
   - `tools/list` - List available tools
   - `tools/call` - Execute tools
   - `prompts/list` - List available prompts

2. **Caching**: Cache note listings to reduce database queries

3. **Pagination**: Support paginated results for large note collections

4. **Search**: Add search functionality for notes

5. **Streaming**: Proper SSE streaming for real-time responses

## Deployment Commands

```bash
# Build and push Docker image
cd lambda/mcp_server
docker build -t 031921999648.dkr.ecr.ap-northeast-1.amazonaws.com/notes-app-mcp-server-dev:latest --platform linux/amd64 .
aws ecr get-login-password --region ap-northeast-1 --profile dev | docker login --username AWS --password-stdin 031921999648.dkr.ecr.ap-northeast-1.amazonaws.com
docker push 031921999648.dkr.ecr.ap-northeast-1.amazonaws.com/notes-app-mcp-server-dev:latest

# Update Lambda function
aws lambda update-function-code \
  --function-name notes-app-mcp-server-dev \
  --image-uri 031921999648.dkr.ecr.ap-northeast-1.amazonaws.com/notes-app-mcp-server-dev:latest \
  --region ap-northeast-1 \
  --profile dev

# Deploy via Terraform
cd terraform
AWS_PROFILE=dev terraform apply -auto-approve
```

## Related Files

- `lambda/mcp_server/app.py` - FastAPI application with MCP server
- `lambda/mcp_server/lambda_handler.py` - Lambda handler with Mangum
- `lambda/mcp_server/Dockerfile` - Docker image configuration
- `terraform/mcp.tf` - Terraform infrastructure for MCP server
- `terraform/iam.tf` - IAM role and policies
