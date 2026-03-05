# MCP Server Setup Guide

This guide explains how to set up and use the MCP (Model Context Protocol) server to allow LLMs like Claude to access your Notes App data.

## Overview

The MCP server provides a secure way for AI assistants to read your notes while maintaining strict access control:

- **Authentication**: Uses AWS Cognito JWT tokens for secure authentication
- **Authorization**: Only accesses notes belonging to the authenticated user
- **Transport**: Server-Sent Events (SSE) for real-time bidirectional communication
- **Infrastructure**: Runs on AWS Lambda with Function URLs

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│ Claude      │────▶│ MCP Server      │────▶│ Aurora DSQL  │
│ Desktop     │ SSE │ (Lambda URL)    │ IAM  │              │
└─────────────┘     └─────────────────┘     └──────────────┘
                           │ JWT
                           │
                    ┌──────┴──────┐
                    │ Cognito    │
                    │ Auth       │
                    └─────────────┘
```

## Prerequisites

1. **AWS CLI configured** with credentials for your environment (`dev` or `prd`)
2. **Claude Desktop** installed ([Download](https://claude.ai/download))
3. **Access to your Notes App** with an authenticated user account

## Deployment

### 1. Deploy MCP Infrastructure

```bash
# Deploy to development environment
make deploy-mcp ENV=dev

# Deploy to production environment
make deploy-mcp ENV=prd
```

This will:
- Create Lambda functions for MCP server and Auth Manager
- Set up Function URLs with SSE support
- Configure IAM roles for DSQL access and Cognito management

### 2. Get MCP Server URL

```bash
# Get the MCP server Function URL
make mcp-logs ENV=dev

# Or view in Terraform outputs
make tf-output ENV=dev | grep mcp_server_function_url
```

## Setting Up Claude Desktop

### Step 1: Create an MCP Client

Call the Auth Manager API to create a new client:

```bash
# Get your JWT token from the Notes App (via browser DevTools or your app's auth flow)
JWT_TOKEN="your-cognito-jwt-token"

# Create a new MCP client
curl -X POST \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Claude Desktop", "description": "MCP client for Claude Desktop"}' \
  https://your-api-gateway-url/api/mcp/create-client
```

Response example:
```json
{
  "client_id": "abc123def456",
  "client_secret": "your-secret-here",
  "configuration_url": "/api/mcp/configure-client/abc123def456",
  "notes": [
    "Use these credentials to configure Claude Desktop",
    "Store the client_secret securely - it will not be shown again",
    "Revoke access by calling DELETE /api/mcp/revoke-client"
  ]
}
```

### Step 2: Configure Claude Desktop

1. **Open Claude Desktop**

2. **Navigate to Settings (⌘ + , or Ctrl + ,)**

3. **Click "Developer"** and find the "MCP Servers" section

4. **Add the following configuration**:

```json
{
  "mcpServers": {
    "notes-app": {
      "transport": {
        "type": "sse",
        "url": "https://your-mcp-server-url.lambda-url.ap-northeast-1.on.aws"
      },
      "authorization": {
        "type": "bearer",
        "token": "your-access-token"
      }
    }
  }
}
```

**Important**: The `url` is the MCP server Function URL from Step 2.

### Step 3: Get Your Access Token

You need a valid Cognito access token. Here are ways to get it:

#### Option A: From Browser DevTools (Easiest)

1. Log in to your Notes App
2. Open DevTools (F12) → Application → Local Storage
3. Find the key containing your JWT token
4. Copy the token value

#### Option B: Using AWS CLI

```bash
# Get tokens using Cognito
aws cognito-idp initiate-auth \
  --client-id YOUR_CLIENT_ID \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=your@email.com,PASSWORD=yourpassword
```

#### Option C: From Your App's Auth Flow

If you're building a UI, use the auth library (Amplify/NextAuth/etc.) to get the current access token.

### Step 4: Restart Claude Desktop

After saving the configuration, restart Claude Desktop to load the new MCP server.

## Usage Examples

### Reading Notes with Claude

Once connected, you can ask Claude to:

**List your notes:**
```
What notes do I have available?
```

**Read a specific note:**
```
Please read the note about my project goals and summarize the key points.
```

**Search across notes:**
```
Find all notes that mention "quarterly review" and extract the action items.
```

**Analyze content:**
```
Read my notes from last week's meeting and create a summary with action items.
```

## API Reference

### Auth Manager Endpoints

#### Create MCP Client
```http
POST /api/mcp/create-client
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "name": "Client Name",
  "description": "Optional description"
}
```

#### Revoke MCP Client
```http
DELETE /api/mcp/revoke-client
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "client_id": "client-id-to-revoke"
}
```

#### List MCP Clients
```http
GET /api/mcp/list-clients
Authorization: Bearer {jwt_token}
```

#### Get Client Configuration
```http
GET /api/mcp/configure-client/{client_id}
Authorization: Bearer {jwt_token}
```

### MCP Server Endpoints

#### SSE Endpoint
```http
POST /
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "resources/list",
  "id": 1
}
```

Available methods:
- `resources/list` - List all user's notes
- `resources/read` - Read a specific note's content

## Security Best Practices

1. **Store Secrets Securely**: The `client_secret` is shown only once. Save it in a secure password manager.

2. **Rotate Tokens**: Access tokens expire after 1 hour. Your application should refresh them automatically.

3. **Revoke When Not Needed**: Delete clients using the revoke endpoint when you're done using them.

4. **Use HTTPS**: All communications are encrypted via TLS/HTTPS.

5. **User Isolation**: The MCP server enforces strict multi-tenancy - users can only access their own notes.

6. **Monitor Logs**: Use `make mcp-logs ENV=dev` to monitor MCP server activity.

## Troubleshooting

### "Connection Failed" Error

**Problem**: Claude Desktop shows connection error.

**Solutions**:
1. Verify the MCP server URL is correct
2. Check your JWT token is valid and not expired
3. Verify the Authorization header format: `Bearer {token}`
4. Check CloudWatch logs: `make mcp-logs ENV=dev`

### "No Resources Found" Error

**Problem**: Claude says no notes are available.

**Solutions**:
1. Verify you have notes in your account
2. Check the `user_id` in your JWT matches your notes' `user_id`
3. Ensure notes aren't soft-deleted (`deleted_at` is NULL)

### "Invalid Token" Error

**Problem**: Token validation fails.

**Solutions**:
1. Get a fresh JWT token from Cognito
2. Verify the token issuer matches your Cognito User Pool
3. Check the token hasn't expired (typically 1 hour)

### "Permission Denied" Error

**Problem**: Auth Manager denies access.

**Solutions**:
1. Verify the JWT token is valid
2. Ensure you're the owner of the client (client name prefix matches your user_id)
3. Check your IAM roles have proper Cognito permissions

### Lambda Timeout Error

**Problem**: MCP server times out during long operations.

**Solutions**:
1. Timeout is set to 15 minutes (900 seconds) for SSE
2. For very large note collections, consider filtering by date or folder
3. Check CloudWatch logs for specific error details

## Monitoring

### View Logs

```bash
# MCP Server logs
make mcp-logs ENV=dev

# Auth Manager logs
make mcp-auth-logs ENV=dev
```

### CloudWatch Metrics

Monitor:
- Lambda invocation count
- Lambda errors
- Lambda duration
- DSQL connection attempts

### Terraform Outputs

```bash
make tf-output ENV=dev
```

Relevant outputs:
- `mcp_server_function_url` - MCP server endpoint
- `mcp_auth_manager_api_url` - Auth manager API endpoint
- `cognito_user_pool_id` - Your Cognito User Pool ID

## Development

### Local Testing

```bash
# Run MCP server locally
cd lambda/mcp_server
uvicorn main:app --reload --port 8000

# Run Auth Manager locally
cd lambda/auth_manager
uvicorn main:app --reload --port 8000
```

### Test MCP Connection

```bash
# List resources
curl -X POST \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"resources/list","id":1}' \
  http://localhost:8000/

# Read a specific resource
curl -X POST \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"resources/read","id":2,"params":{"uri":"notes://note-id-here"}}' \
  http://localhost:8000/
```

## Environment Variables

### MCP Server

| Variable | Description | Required |
|----------|-------------|----------|
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID | Yes |
| `COGNITO_REGION` | AWS region | Yes |
| `DSQL_CLUSTER_ENDPOINT` | DSQL cluster identifier | Yes |
| `ENVIRONMENT` | Environment (dev/prd) | Yes |
| `JWT_ISSUER` | JWT issuer URL | Yes |

### Auth Manager

| Variable | Description | Required |
|----------|-------------|----------|
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID | Yes |
| `COGNITO_REGION` | AWS region | Yes |
| `ENVIRONMENT` | Environment (dev/prd) | Yes |
| `JWT_ISSUER` | JWT issuer URL | Yes |
| `MCP_SERVER_URL` | MCP server Function URL | Yes |

## Contributing

When making changes to the MCP server:

1. Update this README with any API changes
2. Update the Claude Desktop configuration example if needed
3. Test with actual Claude Desktop before deploying
4. Update integration tests to cover new functionality

## License

Same as the parent Notes App project.
