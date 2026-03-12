"""FastAPI application for MCP Server."""
import logging
import os
import time
import json
import hashlib
from datetime import datetime, timezone
from typing import Any
import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from jose import jwk, jwt
from jose.exceptions import ExpiredSignatureError, JWTError
from sqlmodel import Field, Session, SQLModel, create_engine, select
from mcp.server import Server
from mcp.types import (
    ListResourcesRequest,
    ListResourcesResult,
    ReadResourceRequest,
    ReadResourceResult,
    Resource,
    ResourceContents,
    TextContent,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID")
COGNITO_REGION = os.environ.get("COGNITO_REGION", "ap-northeast-1")
DSQL_CLUSTER_ENDPOINT = os.environ.get("DSQL_CLUSTER_ENDPOINT")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "dev")
JWT_ISSUER = os.environ.get("JWT_ISSUER")

# FastAPI app for SSE transport
app = FastAPI(title="MCP Server - Notes App")

# Database engine - will be initialized per request for IAM auth
_engine = None

# Cache for Cognito public keys
_jwks_cache = None
_jwks_cache_time = 0


def get_jwks() -> dict:
    """Fetch and cache Cognito JWKS (JSON Web Key Set)."""
    global _jwks_cache, _jwks_cache_time
    
    # Cache for 5 minutes
    current_time = time.time()
    if _jwks_cache and (current_time - _jwks_cache_time) < 300:
        return _jwks_cache
    
    try:
        region = COGNITO_REGION
        pool_id = COGNITO_USER_POOL_ID
        url = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json"
        
        logger.info(f"Fetching JWKS from {url}")
        response = httpx.get(url, timeout=5)
        response.raise_for_status()
        
        _jwks_cache = response.json()
        _jwks_cache_time = current_time
        return _jwks_cache
    except Exception as e:
        logger.error(f"Failed to fetch JWKS: {e}")
        raise


def verify_jwt_token(token: str) -> dict:
    """Verify a JWT token from Cognito."""
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


def verify_mcp_token(token: str) -> str:
    """Verify a short MCP token against the database using raw SQL."""
    if not token.startswith("mcp_"):
        raise ValueError("Invalid token format")

    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # Use raw SQL to avoid SQLModel mapper conflicts
    try:
        with get_db_engine("system").connect() as conn:
            # Use text() for raw SQL query
            from sqlalchemy import text
            query = text("""
                SELECT user_id, expires_at
                FROM mcp_tokens
                WHERE token_hash = :token_hash
                AND revoked_at IS NULL
                LIMIT 1
            """)
            result = conn.execute(query, {"token_hash": token_hash}).fetchone()

            if not result:
                logger.warning("MCP token not found or revoked")
                raise HTTPException(status_code=401, detail="Invalid token")

            user_id, expires_at = result

            # Check expiration - handle timezone-aware or naive datetime
            now = datetime.now(timezone.utc)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)

            if expires_at < now:
                logger.warning("MCP token expired")
                raise HTTPException(status_code=401, detail="Token expired")

            return user_id
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying MCP token: {e}")
        raise HTTPException(status_code=500, detail="Error verifying token")


def get_db_engine(user_id: str):
    """Create database engine for DSQL with IAM authentication."""
    global _engine
    
    if DSQL_CLUSTER_ENDPOINT:
        region = COGNITO_REGION
        
        def get_connection():
            # Generate IAM auth token
            import boto3
            import psycopg2
            import time
            
            max_retries = 3
            base_delay = 0.5
            
            for attempt in range(max_retries):
                try:
                    # Log system time to diagnose clock skew issues
                    now = time.time()
                    logger.info(f"Attempt {attempt+1}/{max_retries}: Generating auth token at {now}")
                    
                    # Generate IAM auth token
                    client = boto3.client("dsql", region_name=region)
                    token = client.generate_db_connect_admin_auth_token(
                        Hostname=f"{DSQL_CLUSTER_ENDPOINT}.dsql.{region}.on.aws",
                        Region=region,
                    )
                    
                    # Connect using psycopg2
                    conn = psycopg2.connect(
                        host=f"{DSQL_CLUSTER_ENDPOINT}.dsql.{region}.on.aws",
                        port=5432,
                        database="postgres",
                        user="admin",
                        password=token,
                        sslmode="require",
                        connect_timeout=5
                    )
                    return conn
                except psycopg2.OperationalError as e:
                    error_msg = str(e)
                    # Check for signature expired error which indicates clock skew
                    if "Signature expired" in error_msg or "Signature not yet current" in error_msg:
                        logger.warning(f"DSQL connection failed with signature error: {e}")
                        if attempt < max_retries - 1:
                            sleep_time = base_delay * (attempt + 1)
                            logger.info(f"Sleeping for {sleep_time}s to allow clock synchronization...")
                            time.sleep(sleep_time)
                            continue
                    
                    # For other errors or if retries exhausted
                    logger.error(f"Failed to create DSQL connection: {e}")
                    raise
        
        try:
            _engine = create_engine(
                "postgresql+psycopg2://",
                creator=get_connection,
                echo=False,
                pool_pre_ping=True,
                pool_size=1,
                max_overflow=0,
                pool_recycle=300,
            )
            logger.info(f"Created DSQL engine for user {user_id}")
            return _engine
        except Exception as e:
            logger.error(f"Failed to initialize DSQL engine: {e}")
            raise
    else:
        raise HTTPException(status_code=500, detail="DSQL endpoint not configured")


def get_db_session(user_id: str):
    """Get database session for user."""
    engine = get_db_engine(user_id)
    from sqlmodel import Session
    return Session(engine)


# Define Note model (matching backend)
class Note(SQLModel, table=True):
    """Note model for MCP server."""

    __tablename__ = "notes"
    __table_args__ = {"extend_existing": True}

    id: str = Field(primary_key=True)
    title: str
    content: str
    user_id: str
    folder_id: str | None = None
    created_at: str
    updated_at: str


# Define Folder model (matching backend)
class Folder(SQLModel, table=True):
    """Folder model for MCP server."""

    __tablename__ = "folders"
    __table_args__ = {"extend_existing": True}

    id: str = Field(primary_key=True)
    name: str
    user_id: str
    created_at: str
    updated_at: str


# MCP Server instance
server = Server("notes-app-mcp")


@server.list_resources()
async def list_resources(params: ListResourcesRequest) -> list[Resource]:
    """List all notes and folders as MCP resources for the authenticated user."""
    # Get user_id from context (set by authentication middleware)
    user_id = getattr(server, "_current_user_id", None)
    if not user_id:
        logger.warning("list_resources called without user_id in context")
        return []

    logger.info(f"Listing resources for user {user_id}")

    resources = []

    # Query notes and folders for user
    try:
        session = get_db_session(user_id)

        # Get all notes for user
        note_statement = select(Note).where(Note.user_id == user_id)
        notes = session.exec(note_statement).all()

        # Get all folders for user
        folder_statement = select(Folder).where(Folder.user_id == user_id)
        folders = session.exec(folder_statement).all()

        session.close()

        # Add note resources
        for note in notes:
            resources.append(
                Resource(
                    uri=f"notes://note/{note.id}",
                    name=note.title or "Untitled Note",
                    description=f"Note created at {note.created_at}",
                    mimeType="text/markdown",
                )
            )

        # Add folder resources with note count
        from sqlalchemy import func
        # Re-open session for counting query
        session = get_db_session(user_id)
        for folder in folders:
            # Count notes in this folder
            count_stmt = select(func.count(Note.id)).where(Note.folder_id == str(folder.id))
            note_count = session.exec(count_stmt).one()
            resources.append(
                Resource(
                    uri=f"notes://folder/{folder.id}",
                    name=folder.name,
                    description=f"Folder with {note_count} notes",
                    mimeType="application/json",
                )
            )
        session.close()

        logger.info(f"Found {len(notes)} notes and {len(folders)} folders for user {user_id}")
        return resources
    except Exception as e:
        logger.error(f"Error listing resources for user {user_id}: {e}")
        return []


@server.read_resource()
async def read_resource(params: ReadResourceRequest) -> ReadResourceResult:
    """Read the content of a specific note or folder."""
    # Get user_id from context
    user_id = getattr(server, "_current_user_id", None)
    if not user_id:
        raise ValueError("User not authenticated")

    # Parse URI
    uri = params.uri
    if not uri.startswith("notes://"):
        raise ValueError(f"Invalid URI: {uri}")

    # Parse resource type and ID
    # Format: notes://note/{id} or notes://folder/{id}
    parts = uri[len("notes://") :].split("/")
    if len(parts) < 2:
        raise ValueError(f"Invalid URI format: {uri}")

    resource_type = parts[0]
    resource_id = parts[1]

    logger.info(f"Reading {resource_type} {resource_id} for user {user_id}")

    try:
        session = get_db_session(user_id)

        if resource_type == "note":
            # Query note
            statement = select(Note).where(Note.id == resource_id, Note.user_id == user_id)
            note = session.exec(statement).first()

            if not note:
                session.close()
                raise ValueError(f"Note not found: {resource_id}")

            session.close()
            # Return the note content
            return ReadResourceResult(
                contents=[
                    ResourceContents(
                        uri=uri,
                        mimeType="text/markdown",
                        text=note.content,
                    )
                ]
            )
        elif resource_type == "folder":
            # Query folder and its notes
            folder_statement = select(Folder).where(Folder.id == resource_id, Folder.user_id == user_id)
            folder = session.exec(folder_statement).first()

            if not folder:
                session.close()
                raise ValueError(f"Folder not found: {resource_id}")

            # Get all notes in this folder
            note_statement = select(Note).where(Note.folder_id == resource_id, Note.user_id == user_id)
            notes = session.exec(note_statement).all()

            session.close()

            # Return folder information as JSON
            import json
            folder_data = {
                "id": folder.id,
                "name": folder.name,
                "created_at": folder.created_at,
                "updated_at": folder.updated_at,
                "notes": [
                    {
                        "id": note.id,
                        "title": note.title,
                        "created_at": note.created_at,
                        "updated_at": note.updated_at,
                    }
                    for note in notes
                ]
            }

            return ReadResourceResult(
                contents=[
                    ResourceContents(
                        uri=uri,
                        mimeType="application/json",
                        text=json.dumps(folder_data, indent=2),
                    )
                ]
            )
        else:
            session.close()
            raise ValueError(f"Unsupported resource type: {resource_type}")

    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Error reading resource {uri} for user {user_id}: {e}")
        raise ValueError(f"Failed to read resource: {e}")


# Request/Response models for SSE transport
class SSEMessage:
    """SSE message model."""

    jsonrpc: str = "2.0"
    method: str | None = None
    id: str | int | None = None
    params: dict | None = None
    result: Any = None
    error: dict | None = None


async def handle_sse_request(request: dict, user_id: str) -> dict:
    """Handle an MCP request via SSE."""
    # Set user_id in server context
    server._current_user_id = user_id

    try:
        # Parse request
        msg = SSEMessage(**request)

        # Route to appropriate handler
        if msg.method == "resources/list":
            params = ListResourcesRequest(**(msg.params or {}))
            result = await list_resources(params)
            return {"jsonrpc": "2.0", "id": msg.id, "result": result}
        elif msg.method == "resources/read":
            params = ReadResourceRequest(**(msg.params or {}))
            result = await read_resource(params)
            return {"jsonrpc": "2.0", "id": msg.id, "result": result}
        else:
            return {
                "jsonrpc": "2.0",
                "id": msg.id,
                "error": {"code": -32601, "message": f"Method not found: {msg.method}"},
            }
    except ValueError as e:
        return {
            "jsonrpc": "2.0",
            "id": msg.id,
            "error": {"code": -32602, "message": str(e)},
        }
    except Exception as e:
        logger.error(f"Error handling SSE request: {e}")
        return {
            "jsonrpc": "2.0",
            "id": msg.id,
            "error": {"code": -32603, "message": f"Internal error: {e}"},
        }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "environment": ENVIRONMENT}


@app.get("/resources")
async def get_resources(authorization: str | None = Header(None)):
    """GET /resources endpoint for MCP resource listing (REST-style).

    Returns a JSON response with all notes and folders for the authenticated user.
    Compatible with MCP protocol resource format.
    """
    # Verify JWT token
    if not authorization or not authorization.startswith("Bearer "):
        return Response(
            status_code=401,
            headers={
                "WWW-Authenticate": 'Bearer resource_metadata="/.well-known/oauth-protected-resource"'
            },
            content='{"error": "unauthorized", "error_description": "Authentication required"}'
        )

    token = authorization[7:]  # Remove "Bearer " prefix
    user_id: str | None = None

    try:
        if token.startswith("mcp_"):
            # Use short token verification
            user_id = verify_mcp_token(token)
        else:
            # Use Cognito JWT verification
            payload = verify_jwt_token(token)
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="No user_id in token")

        logger.info(f"GET /resources request from user {user_id}")

        # Query notes and folders for user
        session = get_db_session(user_id)

        # Get all notes for user
        note_statement = select(Note).where(Note.user_id == user_id)
        notes = session.exec(note_statement).all()

        # Get all folders for user
        folder_statement = select(Folder).where(Folder.user_id == user_id)
        folders = session.exec(folder_statement).all()

        session.close()

        # Build resources list
        resources = []

        # Add note resources
        for note in notes:
            resources.append({
                "uri": f"notes://note/{note.id}",
                "name": note.title or "Untitled Note",
                "description": f"Note created at {note.created_at}",
                "mimeType": "text/markdown"
            })

        # Add folder resources with note count
        from sqlalchemy import func
        # Re-open session for counting query
        session = get_db_session(user_id)
        for folder in folders:
            # Count notes in this folder
            count_stmt = select(func.count(Note.id)).where(Note.folder_id == str(folder.id))
            note_count = session.exec(count_stmt).one()
            resources.append({
                "uri": f"notes://folder/{folder.id}",
                "name": folder.name,
                "description": f"Folder with {note_count} notes",
                "mimeType": "application/json"
            })
        session.close()

        logger.info(f"Returning {len(notes)} notes and {len(folders)} folders for user {user_id}")

        return {"resources": resources}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in GET /resources: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


# OAuth Authorization Server Metadata endpoint (RFC 8414)
@app.get("/.well-known/oauth-authorization-server")
async def oauth_authorization_server_metadata():
    """OAuth 2.1 Authorization Server Metadata endpoint."""
    return {
        "issuer": JWT_ISSUER,
        "authorization_endpoint": f"https://{os.environ['COGNITO_USER_POOL_DOMAIN']}.auth.{COGNITO_REGION}.amazoncognito.com/oauth2/authorize",
        "token_endpoint": f"https://{os.environ['COGNITO_USER_POOL_DOMAIN']}.auth.{COGNITO_REGION}.amazoncognito.com/oauth2/token",
        "jwks_uri": f"{JWT_ISSUER}/.well-known/jwks.json",
        "registration_endpoint": f"https://{os.environ['API_GATEWAY_REQUEST_ID']}.execute-api.{COGNITO_REGION}.amazonaws.com/{os.environ['STAGE_NAME']}/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "token_endpoint_auth_methods_supported": ["none", "client_secret_basic"],
        "scopes_supported": ["openid", "email", "profile"],
        "code_challenge_methods_supported": ["S256"]
    }


# Protected Resource Server Metadata endpoint (RFC 9728)
@app.get("/.well-known/oauth-protected-resource")
async def oauth_protected_resource_metadata():
    """OAuth 2.1 Protected Resource Server Metadata endpoint."""
    return {
        "resource": f"https://{os.environ['API_GATEWAY_REQUEST_ID']}.execute-api.{COGNITO_REGION}.amazonaws.com/{os.environ['STAGE_NAME']}/mcp",
        "authorization_servers": [f"https://{os.environ['API_GATEWAY_REQUEST_ID']}.execute-api.{COGNITO_REGION}.amazonaws.com/{os.environ['STAGE_NAME']}/.well-known/oauth-authorization-server"],
        "scopes_supported": ["openid", "email", "profile"]
    }


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    """Handle 404 errors by returning OAuth-compatible error format."""
    return JSONResponse(
        status_code=404,
        content={
            "error": "invalid_request",
            "error_description": f"Path not found: {request.url.path}"
        }
    )


def build_jsonrpc_response(request_id: str | int, result: Any = None, error: dict | None = None) -> dict:
    """Build a JSON-RPC 2.0 response."""
    response = {"jsonrpc": "2.0", "id": request_id}
    if result is not None:
        response["result"] = result
    if error is not None:
        response["error"] = error
    return response


def build_jsonrpc_error(code: int, message: str, request_id: str | int = None) -> dict:
    """Build a JSON-RPC 2.0 error response."""
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


async def handle_streamable_http_request(request_data: dict, user_id: str) -> dict:
    """Handle an MCP request via Streamable HTTP Transport."""
    # Set user_id in server context
    server._current_user_id = user_id

    method = request_data.get("method")
    request_id = request_data.get("id")

    if not method:
        return build_jsonrpc_error(
            -32600, "Invalid Request: missing 'method'", request_id
        )

    logger.info(f"Handling MCP method '{method}' for user {user_id}")

    try:
        if method == "initialize":
            # MCP initialization handshake
            params = request_data.get("params", {})
            client_info = params.get("clientInfo", {})
            logger.info(
                f"Initialize request from client: {client_info.get('name', 'unknown')}"
            )
            return build_jsonrpc_response(
                request_id,
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "resources": {},
                    },
                    "serverInfo": {
                        "name": "notes-app-mcp",
                        "version": "1.0.0",
                    },
                },
            )

        elif method == "notifications/initialized":
            # Client notification that initialization is complete
            return build_jsonrpc_response(request_id, {})

        elif method == "resources/list":
            params = ListResourcesRequest(**(request_data.get("params", {})))
            resources = await list_resources(params)
            return build_jsonrpc_response(
                request_id,
                {
                    "resources": [
                        {
                            "uri": r.uri,
                            "name": r.name,
                            "description": r.description,
                            "mimeType": r.mimeType,
                        }
                        for r in resources
                    ]
                },
            )

        elif method == "resources/read":
            # Extract URI directly from params
            params_data = request_data.get("params", {})
            uri = params_data.get("uri")
            if not uri:
                return build_jsonrpc_error(-32602, "Missing required field 'uri'", request_id)

            # Create a ReadResourceRequest-like object with just the uri
            class SimpleReadRequest:
                def __init__(self, uri: str):
                    self.uri = uri

            params = SimpleReadRequest(uri)
            result = await read_resource(params)
            return build_jsonrpc_response(
                request_id,
                {
                    "contents": [
                        {
                            "uri": c.uri,
                            "mimeType": c.mimeType,
                            "text": c.text,
                        }
                        for c in result.contents
                    ]
                },
            )

        elif method == "ping":
            # Simple ping/pong
            return build_jsonrpc_response(request_id, {})

        else:
            return build_jsonrpc_error(
                -32601, f"Method not found: {method}", request_id
            )

    except ValueError as e:
        logger.error(f"Invalid parameters for method '{method}': {e}")
        return build_jsonrpc_error(-32602, str(e), request_id)
    except Exception as e:
        logger.error(f"Error handling method '{method}': {e}", exc_info=True)
        return build_jsonrpc_error(-32603, f"Internal error: {e}", request_id)


@app.post("/mcp")
async def mcp_streamable_http_endpoint(
    request: Request, authorization: str | None = Header(None)
):
    """MCP Streamable HTTP Transport endpoint for MCP protocol.

    This endpoint implements the standard MCP Streamable HTTP Transport
    (https://modelcontextprotocol.io/docs/concepts/transports#streamable-http-transport)
    which returns JSON-RPC responses instead of SSE streams.
    """
    # Verify JWT token
    if not authorization or not authorization.startswith("Bearer "):
        return Response(
            status_code=401,
            headers={
                "WWW-Authenticate": 'Bearer resource_metadata="/.well-known/oauth-protected-resource"'
            },
            content='{"error": "unauthorized", "error_description": "Authentication required"}'
        )

    token = authorization[7:]  # Remove "Bearer " prefix
    try:
        if token.startswith("mcp_"):
            # Use short token verification
            user_id = verify_mcp_token(token)
        else:
            # Use Cognito JWT verification
            payload = verify_jwt_token(token)
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="No user_id in token")

        # Handle request
        request_data = await request.json()
        response = await handle_streamable_http_request(request_data, user_id)

        # Return as JSON (not SSE)
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"MCP endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/")
async def sse_endpoint(request: Request, authorization: str | None = Header(None)):
    """SSE endpoint for MCP protocol (deprecated, use /mcp instead)."""
    # Verify JWT token
    if not authorization or not authorization.startswith("Bearer "):
        return Response(
            status_code=401,
            headers={
                "WWW-Authenticate": 'Bearer resource_metadata="/.well-known/oauth-protected-resource"'
            },
            content='{"error": "unauthorized", "error_description": "Authentication required"}'
        )

    token = authorization[7:]  # Remove "Bearer " prefix
    try:
        if token.startswith("mcp_"):
            # Use short token verification
            user_id = verify_mcp_token(token)
        else:
            # Use Cognito JWT verification
            payload = verify_jwt_token(token)
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="No user_id in token")

        # Handle request
        import json
        request_data = await request.json()
        response = await handle_sse_request(request_data, user_id)

        # Return as SSE stream
        async def generate():
            yield f"data: {json.dumps(response)}\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"SSE endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
