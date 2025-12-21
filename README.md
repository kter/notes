# Mac Notes Clone

A Mac Notes app clone web application with AI-powered features built using modern AWS serverless architecture.

## Features

- 📁 **Folder Management**: Organize notes in folders
- 📝 **Rich Note Editing**: Create and edit notes with auto-save
- 🤖 **AI Summarization**: Get AI-generated summaries of your notes
- 💬 **AI Q&A**: Chat with AI about your note content
- 🔒 **Authentication**: Secure auth via Amazon Cognito

## Tech Stack

### Frontend
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Shadcn/ui

### Backend
- FastAPI (Python 3.12)
- SQLModel
- Pydantic v2
- Amazon Bedrock (Claude)

### Infrastructure
- Amazon Cognito (Auth)
- Aurora DSQL (PostgreSQL-compatible)
- S3 + CloudFront (Static hosting)
- Terraform (IaC)

## Project Structure

```
notes/
├── .devcontainer/     # VS Code DevContainer configuration
├── backend/           # FastAPI backend
│   ├── app/
│   │   ├── auth/      # Cognito JWT verification
│   │   ├── models/    # SQLModel models
│   │   ├── routers/   # API endpoints
│   │   └── services/  # Bedrock AI service
│   └── pyproject.toml
├── frontend/          # Next.js frontend
│   └── src/
│       ├── app/       # App Router pages
│       ├── components/ # UI components
│       ├── lib/       # API client
│       └── types/     # TypeScript types
└── terraform/         # AWS infrastructure
```

## Development Setup

### Prerequisites
- Docker and VS Code with DevContainers extension
- AWS account with dev/prd profiles configured

### Quick Start

1. Open the project in VS Code
2. Click "Reopen in Container" when prompted
3. Start the development servers:

```bash
# Backend
cd backend
uv sync
uv run uvicorn app.main:app --reload

# Frontend  
cd frontend
npm install
npm run dev
```

4. Access the app at http://localhost:3000

## Environment Configuration

### Backend (.env)
```
DATABASE_URL=postgresql://notes:notes@db:5432/notes
COGNITO_USER_POOL_ID=<your-pool-id>
COGNITO_APP_CLIENT_ID=<your-client-id>
BEDROCK_REGION=us-east-1
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ENVIRONMENT=dev
```

## Infrastructure Deployment

```bash
cd terraform

# Initialize
terraform init

# Select workspace
terraform workspace select dev  # or prd

# Deploy
terraform plan
terraform apply
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/folders/ | List folders |
| POST | /api/folders/ | Create folder |
| PATCH | /api/folders/{id} | Update folder |
| DELETE | /api/folders/{id} | Delete folder |
| GET | /api/notes/ | List notes |
| POST | /api/notes/ | Create note |
| PATCH | /api/notes/{id} | Update note |
| DELETE | /api/notes/{id} | Delete note |
| POST | /api/ai/summarize | Summarize note |
| POST | /api/ai/chat | Chat about note |

## License

MIT
