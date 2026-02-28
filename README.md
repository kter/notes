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
- [mise](https://mise.jdx.dev/) and [direnv](https://direnv.net/) (recommended for local development)

### Local Environment Setup (mise + direnv)

This project uses **mise** for managing tool versions (Node.js, Python, Go) and **direnv** for automatically loading the environment. This ensures all developers use the same tool versions and environment variables.

For detailed installation and concepts, refer to [this article](https://qiita.com/kter/items/8d3113ac3b83dc7abb8c).

#### 1. Installation

If you haven't installed them yet:

```bash
# Install mise
curl https://mise.run | sh

# Install direnv (example for macOS)
brew install direnv
```

**シェルへのフック設定:**
お使いのシェル（Bash or Zsh）の設定ファイルに以下を追記してください。

**Bash (`~/.bashrc`)の場合:**
```bash
echo 'eval "$(~/.local/bin/mise activate bash)"' >> ~/.bashrc
echo 'eval "$(direnv hook bash)"' >> ~/.bashrc
```

**Zsh (`~/.zshrc`)の場合:**
```zsh
echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
```

設定を反映させるために、ターミナルを再起動するか `source ~/.bashrc` (または `~/.zshrc`) を実行してください。

#### 2. Project Setup

Run the following commands in the project root:

```bash
# Trust the local mise configuration
mise trust

# Install required tool versions specified in mise.toml
mise install

# Allow direnv to load the .envrc and mise environment
direnv allow
```

Once set up, the correct versions of `node`, `python`, and `go` will be automatically activated whenever you enter the project directory.

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

The infrastructure is managed using Terraform and separated into `dev` and `prd` environments using both separate AWS accounts (S3 buckets) and Terraform workspaces.

```bash
# Initialize and select environment (automatically handles profile and backend-config)
make tf-init ENV=dev

# Deployment commands
make tf-plan ENV=dev
make tf-apply ENV=dev
```

## Application Deployment

Deployment is simplified through the Makefile. By default, `ENV=dev` is used.

### Quick Lambda Update
```bash
# Update Lambda function code only (fast)
make update-lambda ENV=dev
```

### Full Deployment
```bash
# Build and deploy both backend (Docker) and frontend (S3/CloudFront)
make deploy ENV=prd
```

> [!NOTE]
> The Makefile automatically uses the AWS profile named after the `ENV` value (e.g., `ENV=prd` uses `--profile prd`). Ensure these profiles are configured in your `~/.aws/credentials`.

## Testing

### Backend Unit Tests

```bash
cd backend
uv run pytest
```

### Frontend E2E Tests (Playwright)

E2E tests use Playwright to test the application across multiple browsers.

#### Setup

1. Create `frontend/.env.local` with test credentials:
   ```env
   E2E_TEST_USER_EMAIL=your-test-user@example.com
   E2E_TEST_USER_PASSWORD=YourTestPassword123!
   ```

2. Install Playwright browsers:
   ```bash
   cd frontend
   npx playwright install
   ```

#### Running Tests

```bash
# Local development (starts dev server automatically)
npx playwright test

# Against dev environment
E2E_TARGET=dev npx playwright test

# Against production
E2E_TARGET=prd npx playwright test

# Run specific test file
E2E_TARGET=dev npx playwright test tests/auth.spec.ts

# Run with UI mode (interactive)
npx playwright test --ui

# View HTML report
npx playwright show-report
```

> [!TIP]
> For detailed credential management and CI/CD setup, see [frontend/docs/E2E_CREDENTIALS.md](frontend/docs/E2E_CREDENTIALS.md).

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
