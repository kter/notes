# Mac Notes Clone

A Mac Notes app clone web application with AI-powered features built using modern AWS serverless architecture.

## Features

- 📁 **Folder Management**: Organize notes in folders
- 📝 **Rich Note Editing**: Create and edit notes with auto-save
- 🤖 **AI Summarization**: Get AI-generated summaries of your notes
- 💬 **AI Q&A**: Chat with AI about your note content
- 🔒 **Authentication**: Secure auth via Amazon Cognito
- 🛠️ **Admin Console**: Manage users, token limits, and per-user settings

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

# Install git hooks
make install-hooks
```

Once set up, the correct versions of `node`, `python`, and `go` will be automatically activated whenever you enter the project directory.

Git hooks are managed with `lefthook`. The configured hooks run fast lint checks on `pre-commit`, and heavier test suites on `pre-push`.

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
BOOTSTRAP_ADMIN_EMAILS=admin@example.com
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ENVIRONMENT=dev
```

## Admin Console

- Production: `https://admin.notes.devtools.site`
- Development: `https://admin.notes.dev.devtools.site`

Users are shared with the main application. Only users with `admin=true` in the app database can access the admin console.
For the initial bootstrap, configure `BOOTSTRAP_ADMIN_EMAILS` or `BOOTSTRAP_ADMIN_USER_IDS` on the backend so the first admin user can be provisioned automatically on login.

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

Makefile is the primary entry point for tests. `make help` shows the full list, and the targets below are the normal day-to-day commands.

### Quick Start

```bash
# Fast local check used most often
make test

# All unit tests, including the MCP Lambda package
make test-unit

# Backend integration tests against the deployed dev environment
make test-integration ENV=dev

# Full E2E split that matches CI
make test-e2e-all ENV=dev

# Everything: lint + unit + integration + E2E
make test-all ENV=dev
```

### What Each Target Runs

```bash
# Default fast suite: backend + frontend unit tests + lint
make test

# Unit tests only
make test-backend
make test-frontend
make test-mcp-lambda-unit
make test-unit

# Deployed-environment tests
make test-integration ENV=dev
make test-mcp-lambda-integration

# E2E on browsers that run well on the host
make test-e2e-host ENV=dev

# E2E for each Safari/WebKit project in Docker
make test-e2e-webkit-docker ENV=dev
make test-e2e-mobile-safari-docker ENV=dev

# CI-style full E2E run
make test-e2e-all ENV=dev

# Full validation before a larger merge or release
make test-all ENV=dev
```

### E2E Setup

E2E tests use Playwright across Chromium and Safari-family projects.

1. Create `frontend/.env.local` with test credentials:
   ```env
   E2E_TEST_USER_EMAIL=your-test-user@example.com
   E2E_TEST_USER_PASSWORD=YourTestPassword123!
   ```

2. Install Playwright browsers for host-side projects:
   ```bash
   cd frontend
   npx playwright install
   ```

3. Use Docker for `webkit` and `Mobile Safari`.
   On Linux hosts we have seen WebKit/WPE crashes such as `WPEWebProcess quit unexpectedly`, so the supported local path is:
   - Host execution: `chromium`, `Mobile Chrome`
   - Docker execution: `webkit`, `Mobile Safari`

### E2E Examples

```bash
# Narrow to a specific file
make test-e2e-host ENV=dev TEST_ARGS='tests/auth.spec.ts'

# Narrow by grep
make test-e2e-host ENV=dev TEST_ARGS='-g "full cycle"'

# Run a single Docker-backed browser
make test-e2e-docker ENV=dev PROJECT=webkit TEST_ARGS='tests/auth.spec.ts'

# If your host can run every Playwright project directly, this remains available
make test-e2e ENV=dev
```

GitHub Actions uses the same split as `make test-e2e-all`: `chromium` and `Mobile Chrome` run on the standard Ubuntu runner, while `webkit` and `Mobile Safari` run inside the Playwright Docker image. Configure `E2E_TEST_USER_EMAIL` and `E2E_TEST_USER_PASSWORD` as repository secrets before enabling the workflow.

### Notes

- `ENV=dev|prd` selects the deployed environment for integration and E2E tests.
- `TEST_ARGS='...'` is passed through to Playwright, so file paths and `-g` filters work as-is.
- `test-mcp-lambda-integration` requires the AWS/Cognito-related environment variables expected by [`lambda/mcp_server/tests/test_mcp_integration.py`](lambda/mcp_server/tests/test_mcp_integration.py).
- `test-all` includes `test-integration`, `test-mcp-lambda-integration`, and `test-e2e-all`, so it assumes the deployed environment, Docker, and E2E credentials are all available.

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
