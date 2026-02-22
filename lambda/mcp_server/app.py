"""FastAPI application for MCP Server."""
import logging
import os
import time
import json
from typing import Any
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
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
        import requests
        response = requests.get(url, timeout=5)
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
        except Exception as e:
            logger.error(f"Failed to initialize DSQL engine: {e}")
            raise
    else:
        raise HTTPException(status_code=500, detail="DSQL endpoint not configured")


def get_db_session(user_id: str):
    """Get database session for user."""
    engine = get_db_engine(user_id)
    with Session(engine) as session:
        yield session


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
    deleted_at: str | None = None


# MCP Server instance
server = Server("notes-app-mcp")


@server.list_resources()
async def list_resources(params: ListResourcesRequest) -> list[Resource]:
    """List all notes as MCP resources for the authenticated user."""
    # Get user_id from context (set by authentication middleware)
    user_id = getattr(server, "_current_user_id", None)
    if not user_id:
        logger.warning("list_resources called without user_id in context")
        return []

    logger.info(f"Listing resources for user {user_id}")

    # Query notes for user
    try:
        with get_db_session(user_id) as session:
            statement = select(Note).where(
                Note.user_id == user_id, Note.deleted_at.is_(None)
            )
            results = session.exec(statement).all()

            resources = [
                Resource(
                    uri=f"notes://{note.id}",
                    name=note.title or "Untitled Note",
                    description=f"Note created at {note.created_at}",
                    mimeType="text/markdown",
                )
                for note in results
            ]

            logger.info(f"Found {len(resources)} notes for user {user_id}")
            return resources
    except Exception as e:
        logger.error(f"Error listing resources for user {user_id}: {e}")
        return []


@server.read_resource()
async def read_resource(params: ReadResourceRequest) -> ReadResourceResult:
    """Read the content of a specific note."""
    # Get user_id from context
    user_id = getattr(server, "_current_user_id", None)
    if not user_id:
        raise ValueError("User not authenticated")

    # Parse note ID from URI
    uri = params.uri
    if not uri.startswith("notes://"):
        raise ValueError(f"Invalid URI: {uri}")

    note_id = uri[len("notes://") :]
    logger.info(f"Reading note {note_id} for user {user_id}")

    # Query note
    try:
        with get_db_session(user_id) as session:
            statement = select(Note).where(
                Note.id == note_id, Note.user_id == user_id, Note.deleted_at.is_(None)
            )
            note = session.exec(statement).first()

            if not note:
                raise ValueError(f"Note not found: {note_id}")

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
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Error reading note {note_id} for user {user_id}: {e}")
        raise ValueError(f"Failed to read note: {e}")


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


@app.post("/")
async def sse_endpoint(request: Request, authorization: str = Header(...)):
    """SSE endpoint for MCP protocol."""
    # Verify JWT token
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization[7:]  # Remove "Bearer " prefix
    try:
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
