"""MCP Auth Manager - Handles DCR and Revoke for Cognito App Clients.

This service allows users to create and revoke Cognito App Clients for MCP access,
enabling secure integration with Claude Desktop and other MCP clients.
"""

import logging
import os
import secrets
import string
from typing import Any

import boto3
from fastapi import FastAPI, Header, HTTPException
from jose import jwk, jwt
from jose.exceptions import ExpiredSignatureError, JWTError
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID")
COGNITO_REGION = os.environ.get("COGNITO_REGION", "ap-northeast-1")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "dev")
JWT_ISSUER = os.environ.get("JWT_ISSUER")

# FastAPI app
app = FastAPI(title="MCP Auth Manager")

# Create Mangum handler for Lambda
mangum_handler = Mangum(app, lifespan="off")

# Cognito client
cognito_client = boto3.client("cognito-idp", region_name=COGNITO_REGION)

# Cache for Cognito public keys
_jwks_cache = None
_jwks_cache_time = 0


def get_jwks() -> dict:
    """Fetch and cache Cognito JWKS (JSON Web Key Set).

    Returns:
        JWKS containing public keys for JWT verification
    """
    global _jwks_cache, _jwks_cache_time

    # Cache for 5 minutes
    current_time = __import__("time").time()
    if _jwks_cache and (current_time - _jwks_cache_time) < 300:
        return _jwks_cache

    try:
        region = COGNITO_REGION
        pool_id = COGNITO_USER_POOL_ID
        url = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json"

        logger.info(f"Fetching JWKS from {url}")
        response = __import__("requests").get(url, timeout=5)
        response.raise_for_status()

        _jwks_cache = response.json()
        _jwks_cache_time = current_time
        return _jwks_cache
    except Exception as e:
        logger.error(f"Failed to fetch JWKS: {e}")
        raise


def verify_jwt_token(token: str) -> dict:
    """Verify a JWT token from Cognito.

    Args:
        token: JWT token from Authorization header

    Returns:
        Decoded token payload if valid

    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        # Decode header to get kid (key ID)
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        # Get JWKS
        jwks = get_jwks()

        # Find the matching key
        rsa_key = None
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                rsa_key = jwk.construct(key)
                break

        if rsa_key is None:
            logger.error(f"Unable to find a signing key that matches: {kid}")
            raise HTTPException(status_code=401, detail="Invalid token")

        # Verify the token
        payload = jwt.decode(
            token,
            rsa_key.to_pem().public_key(),
            algorithms=["RS256"],
            issuer=JWT_ISSUER,
            audience=COGNITO_USER_POOL_ID,
            options={"verify_aud": False},  # Cognito doesn't always set aud
        )

        return payload
    except ExpiredSignatureError:
        logger.warning("Token has expired")
        raise HTTPException(status_code=401, detail="Token has expired")
    except JWTError as e:
        logger.warning(f"JWT validation failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        logger.error(f"Token verification error: {e}")
        raise HTTPException(status_code=401, detail="Token verification failed")


# Request/Response models
class CreateClientRequest(BaseModel):
    """Request to create a new MCP App Client."""

    name: str
    description: str | None = None


class CreateClientResponse(BaseModel):
    """Response with client credentials."""

    client_id: str
    client_secret: str | None
    configuration_url: str
    notes: list[str]


class RevokeClientRequest(BaseModel):
    """Request to revoke an MCP App Client."""

    client_id: str


class ListClientsResponse(BaseModel):
    """Response with list of active clients."""

    clients: list[dict[str, Any]]


class ClientInfo(BaseModel):
    """Information about an MCP client."""

    client_id: str
    client_name: str
    client_secret: str | None = None
    created_at: str
    configuration: dict[str, Any]


@app.post("/api/mcp/create-client")
async def create_mcp_client(
    request: CreateClientRequest,
    authorization: str = Header(...),
) -> CreateClientResponse:
    """Create a new Cognito App Client for MCP access.

    This implements DCR (Dynamic Client Registration) by creating a new
    App Client in Cognito that can be used to authenticate with the MCP server.

    Args:
        request: CreateClientRequest with client name and optional description
        authorization: JWT token from Authorization header

    Returns:
        CreateClientResponse with client credentials and configuration

    Raises:
        HTTPException: If authentication fails or client creation fails
    """
    # Verify JWT token
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization[7:]  # Remove "Bearer " prefix
    try:
        payload = verify_jwt_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="No user_id in token")
    except HTTPException:
        raise

    logger.info(f"Creating MCP client for user {user_id}: {request.name}")

    try:
        # Generate client ID with user prefix for identification
        client_id_suffix = "".join(
            secrets.choice(string.ascii_lowercase + string.digits) for _ in range(16)
        )
        client_name_prefix = "".join(
            c for c in request.name if c.isalnum() or c in ("_", "-")
        )[:20]
        client_name = f"mcp-{user_id[:8]}-{client_name_prefix}-{client_id_suffix}"

        # Generate a secure client secret
        client_secret = "".join(
            secrets.choice(string.ascii_letters + string.digits + "!@#$%^&*")
            for _ in range(64)
        )

        # Create the App Client
        response = cognito_client.create_user_pool_client(
            UserPoolId=COGNITO_USER_POOL_ID,
            ClientName=client_name,
            GenerateSecret=True,
            ExplicitAuthFlows=["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_PASSWORD_AUTH"],
            PreventUserExistenceErrors="ENABLED",
            TokenValidityUnits={
                "AccessToken": "hours",
                "IdToken": "hours",
                "RefreshToken": "days",
            },
            AccessTokenValidity=1,  # 1 hour
            IdTokenValidity=1,  # 1 hour
            RefreshTokenValidity=30,  # 30 days
        )

        new_client_id = response["UserPoolClient"]["ClientId"]

        # Update the client to set our custom secret (Cognito generates its own)
        # Note: Cognito generates its own secret, we'll use that one
        cognito_client.update_user_pool_client(
            UserPoolId=COGNITO_USER_POOL_ID,
            ClientId=new_client_id,
            ClientName=client_name,
            ExplicitAuthFlows=["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_PASSWORD_AUTH"],
        )

        logger.info(f"Created MCP client {new_client_id} for user {user_id}")

        # Get MCP server URL from environment (would be passed via Lambda env)
        mcp_server_url = os.environ.get("MCP_SERVER_URL", "https://example.com")

        return CreateClientResponse(
            client_id=new_client_id,
            client_secret=response["UserPoolClient"].get("ClientSecret"),
            configuration_url=f"/api/mcp/configure-client/{new_client_id}",
            notes=[
                "Use these credentials to configure Claude Desktop",
                "Store the client_secret securely - it will not be shown again",
                "Revoke access by calling DELETE /api/mcp/revoke-client",
            ],
        )

    except cognito_client.exceptions.NotAuthorizedException:
        logger.error(f"NotAuthorizedException when creating client for user {user_id}")
        raise HTTPException(status_code=403, detail="Not authorized to create clients")
    except cognito_client.exceptions.LimitExceededException:
        logger.error(f"LimitExceededException when creating client for user {user_id}")
        raise HTTPException(
            status_code=429, detail="Too many clients. Please revoke some existing ones."
        )
    except Exception as e:
        logger.error(f"Error creating MCP client: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create client: {e}")


@app.delete("/api/mcp/revoke-client")
async def revoke_mcp_client(
    request: RevokeClientRequest,
    authorization: str = Header(...),
) -> dict[str, str]:
    """Revoke an MCP App Client by deleting it.

    Args:
        request: RevokeClientRequest with client_id to revoke
        authorization: JWT token from Authorization header

    Returns:
        Success message

    Raises:
        HTTPException: If authentication fails or client deletion fails
    """
    # Verify JWT token
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization[7:]  # Remove "Bearer " prefix
    try:
        payload = verify_jwt_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="No user_id in token")
    except HTTPException:
        raise

    logger.info(f"Revoking MCP client {request.client_id} for user {user_id}")

    try:
        # Verify client belongs to user by checking client name prefix
        try:
            client_info = cognito_client.describe_user_pool_client(
                UserPoolId=COGNITO_USER_POOL_ID, ClientId=request.client_id
            )
            client_name = client_info["UserPoolClient"]["ClientName"]

            # Verify client was created by this user (check prefix)
            if not client_name.startswith(f"mcp-{user_id[:8]}-"):
                logger.warning(
                    f"User {user_id} attempted to revoke client {request.client_id} "
                    f"that doesn't belong to them"
                )
                raise HTTPException(
                    status_code=403, detail="You can only revoke your own clients"
                )
        except cognito_client.exceptions.ResourceNotFoundException:
            raise HTTPException(
                status_code=404, detail="Client not found or already deleted"
            )

        # Delete the client
        cognito_client.delete_user_pool_client(
            UserPoolId=COGNITO_USER_POOL_ID, ClientId=request.client_id
        )

        logger.info(f"Successfully revoked MCP client {request.client_id}")

        return {"message": "Client revoked successfully", "client_id": request.client_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking MCP client: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to revoke client: {e}")


@app.get("/api/mcp/list-clients")
async def list_mcp_clients(
    authorization: str = Header(...),
) -> ListClientsResponse:
    """List all MCP App Clients for the authenticated user.

    Args:
        authorization: JWT token from Authorization header

    Returns:
        ListClientsResponse with list of user's clients

    Raises:
        HTTPException: If authentication fails
    """
    # Verify JWT token
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization[7:]  # Remove "Bearer " prefix
    try:
        payload = verify_jwt_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="No user_id in token")
    except HTTPException:
        raise

    logger.info(f"Listing MCP clients for user {user_id}")

    try:
        # List all clients in the pool
        response = cognito_client.list_user_pool_clients(
            UserPoolId=COGNITO_USER_POOL_ID, MaxResults=60
        )

        # Filter to only MCP clients created by this user
        user_prefix = f"mcp-{user_id[:8]}-"
        user_clients = []

        for client in response["UserPoolClients"]:
            client_name = client["ClientName"]
            if client_name.startswith(user_prefix):
                user_clients.append(
                    {
                        "client_id": client["ClientId"],
                        "client_name": client_name,
                        "user_pool_id": COGNITO_USER_POOL_ID,
                        "created_date": client.get("CreationDate", "").isoformat()
                        if client.get("CreationDate")
                        else None,
                        "last_modified_date": client.get("LastModifiedDate", "")
                        .isoformat()
                        if client.get("LastModifiedDate")
                        else None,
                    }
                )

        return ListClientsResponse(clients=user_clients)

    except Exception as e:
        logger.error(f"Error listing MCP clients: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list clients: {e}")


@app.get("/api/mcp/configure-client/{client_id}")
async def configure_client(
    client_id: str,
    authorization: str = Header(...),
) -> dict[str, Any]:
    """Get configuration for a client (for Claude Desktop setup).

    Args:
        client_id: Client ID to configure
        authorization: JWT token from Authorization header

    Returns:
        Configuration dict with Claude Desktop config

    Raises:
        HTTPException: If authentication fails or client not found
    """
    # Verify JWT token
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization[7:]  # Remove "Bearer " prefix
    try:
        payload = verify_jwt_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="No user_id in token")
    except HTTPException:
        raise

    # Verify client belongs to user
    try:
        client_info = cognito_client.describe_user_pool_client(
            UserPoolId=COGNITO_USER_POOL_ID, ClientId=client_id
        )
        client_name = client_info["UserPoolClient"]["ClientName"]

        if not client_name.startswith(f"mcp-{user_id[:8]}-"):
            raise HTTPException(status_code=403, detail="You can only access your own clients")
    except cognito_client.exceptions.ResourceNotFoundException:
        raise HTTPException(status_code=404, detail="Client not found")

    # Get MCP server URL from environment
    mcp_server_url = os.environ.get("MCP_SERVER_URL", "https://example.com")

    # Return Claude Desktop configuration
    return {
        "mcpServers": {
            "notes-app": {
                "transport": {
                    "type": "sse",
                    "url": mcp_server_url,
                },
                "authorization": {
                    "type": "bearer",
                    "token": f"{{YOUR_ACCESS_TOKEN}}",  # User needs to get this from Cognito
                },
            }
        },
        "instructions": """
To use this MCP client with Claude Desktop:

1. Get an access token by authenticating with Cognito:
   - User Pool ID: {user_pool_id}
   - Client ID: {client_id}

2. Add the above configuration to Claude Desktop's config.json

3. Replace {{YOUR_ACCESS_TOKEN}} with your actual access token
   (you can get this by authenticating with Cognito using your email/password)

4. Restart Claude Desktop to load the new MCP server
""".format(
            user_pool_id=COGNITO_USER_POOL_ID, client_id=client_id
        ),
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "environment": ENVIRONMENT}


# Lambda handler
def lambda_handler(event, context):
    """AWS Lambda handler using Mangum.

    Args:
        event: Lambda event
        context: Lambda context

    Returns:
        Lambda response
    """
    return mangum_handler(event, context)


if __name__ == "__main__":
    import uvicorn

    # For local development
    uvicorn.run(app, host="0.0.0.0", port=8000)
