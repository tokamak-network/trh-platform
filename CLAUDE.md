# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TRH Platform** is a Docker Compose-based full-stack application with AWS EC2 cloud deployment capabilities. It consists of a PostgreSQL database, Node.js backend API, and Next.js frontend UI, managed via Terraform for infrastructure provisioning.

## Architecture

### Local Development (Docker Compose)

The application is containerized using `docker-compose.yml` with three core services:

- **Database**: PostgreSQL 15 (port 5432)
  - Uses `config/.env.backend` for database credentials
  - Persistent data stored in `postgres_data` volume
- **Backend**: trh-backend Docker image (port 8000)
  - Node.js API service
  - Environment: `config/.env.backend`
  - Persistent storage in `backend_storage` volume
  - Auto-restarts unless manually stopped
- **Frontend**: trh-platform-ui Docker image (port 3000)
  - Next.js web interface
  - Environment: `config/.env.frontend`
  - Depends on backend service
  - Auto-restarts unless manually stopped

### Cloud Deployment (AWS EC2 + Terraform)

The `ec2/` directory contains Terraform configuration for automated EC2 provisioning:

- **main.tf**: Instance, security group, and key pair definitions
  - Uses Ubuntu 24.04 LTS AMI
  - Provisions EC2 instance with 50GB encrypted root volume
  - Remote provisioning executes `install.sh` (node setup) + `make setup` (service startup)
- **variables.tf**: Input variables for instance type, names, credentials
- **outputs.tf**: Terraform outputs (instance IP, DNS)
- **terraform.tfstate**: State file (auto-generated, tracked in .git)
- **setup.sh**: Generates SSH key pairs and stores configuration in `ec2/.env`

Security group opens:
- SSH (port 22) from 0.0.0.0/0
- Frontend (port 3000) from 0.0.0.0/0
- Backend (port 8000) from 0.0.0.0/0

## Development Workflow

### Initial Setup

```bash
make setup        # Starts containers and runs backend initialization
```

This command:
1. Creates `config/.env.docker` from template if it doesn't exist
2. Runs `docker compose up -d`
3. Executes `setup.sh` to configure backend container

### Configuration Files

All environment variables are managed through templates in `config/`:

- **env.docker.template**: Docker image versions (TRH_BACKEND_VERSION, TRH_PLATFORM_UI_VERSION)
- **env.backend.template**: Backend service config (PostgreSQL connection, JWT secret, default admin)
- **env.frontend.template**: Frontend config (NEXT_PUBLIC_API_BASE_URL)

These are copied to `.env.*` files by `make config` or `make setup`.

### Common Commands

**Service Management**:
```bash
make up          # Start all services (docker compose up -d)
make down        # Stop and remove containers (with confirmation)
make clean       # Stop services and remove volumes
make status      # Show running container status
make logs        # Stream all service logs
make update      # Pull latest Docker images and restart
make config      # Interactive environment configuration
```

**EC2 Deployment**:
```bash
make ec2-setup      # Configure AWS credentials and SSH keys (one-time)
make ec2-deploy     # Full deployment: infrastructure + platform setup
make ec2-update     # Update running instance (git pull + docker pull + restart)
make ec2-status     # Show Terraform state and instance info
make ec2-destroy    # Terminate all resources
make ec2-clean      # Remove Terraform state files
```

## Key Files and Responsibilities

| File | Purpose |
|------|---------|
| Makefile | All operations: dev, docker, EC2 lifecycle, configuration |
| docker-compose.yml | Service orchestration with image digests (pinned for reproducibility) |
| ec2/main.tf | EC2 instance, security group, key pair resources |
| ec2/setup.sh | SSH key generation and AWS credential setup |
| setup.sh | Backend container initialization (installs dependencies) |
| install.sh | EC2 user-data script (installs git, docker, terraform, aws-cli) |
| config/ | Environment templates and config files |

## Critical Patterns

### Image Digests

Docker images use content-based digests (SHA256) instead of tags:
```yaml
image: tokamaknetwork/trh-backend@sha256:fe7cb41cb852cfc955d4ac21bbd5917c7e505affba475a166abd2e43fb2375be
```
This ensures reproducible deployments. Update digests when upgrading service versions.

### EC2 Provisioning Flow

1. **EC2 Setup** (one-time): `make ec2-setup` → AWS credentials + SSH key pair → stored in `ec2/.env`
2. **EC2 Deploy**: `make ec2-deploy` → Terraform init/plan/apply → Remote provisioning:
   - Cloud-init waits for instance readiness
   - `install.sh` installs tools (git, docker, terraform, aws-cli)
   - Repository cloned from GitHub
   - `make config` generates environment files
   - `make setup` starts services in the instance
3. **EC2 Update**: `make ec2-update` → SSH into instance → `git pull` → `docker compose pull` → restart services

### State Management

- **Terraform state**: `ec2/terraform.tfstate` - critical for infrastructure management
- **Environment config**: `ec2/.env` - Terraform variables, regenerated by `make ec2-deploy`
- Destroyed infrastructure cleans up state files automatically

### Error Recovery

**Deployment fails with credentials mismatch**: AWS account in current credentials must match the account that created the resources. Use `make ec2-setup` to reconfigure credentials.

**Partial EC2 failures**: Check `make ec2-status` to verify if instance exists. Can manually SSH in and complete setup, or destroy + retry.

## Configuration Precedence

1. `config/.env.docker` - Docker image versions
2. `config/.env.backend` - Backend & database config (PostgreSQL, JWT, admin)
3. `config/.env.frontend` - Frontend config (API URL)
4. `ec2/.env` - Terraform variables (only during EC2 deployment)

Frontend must know backend IP/URL for API calls. On EC2, this is automatically set by Terraform provisioning.

## Service Access

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **PostgreSQL**: localhost:5432 (default: postgres/postgres)

Default admin credentials from `config/.env.backend`:
- Email: admin@gmail.com
- Password: admin

## Troubleshooting Checklist

- Services won't start: Check `make logs` for errors, ensure Docker is running
- Database connection fails: Verify `config/.env.backend` has correct PostgreSQL credentials
- Frontend can't reach backend: Check `NEXT_PUBLIC_API_BASE_URL` in `config/.env.frontend`
- EC2 deployment times out: SSH provisioning may be slow, check `make ec2-status` for instance health
- Terraform state corrupted: Run `make ec2-clean` and retry deployment (will destroy existing resources)

## Daily Report Generation

Supports Anthropic Claude API and OpenAI-compatible APIs (Qwen, vLLM, Ollama, etc.). Auto-detects provider based on which API key is set.

### Quick Command

```bash
# Anthropic Claude
export ANTHROPIC_API_KEY="sk-ant-..."
export CLAUDE_MODEL="claude-3-5-sonnet-20241022"  # (Optional, defaults to claude-opus-4-6)
make daily-report

# OpenAI-compatible (Qwen example)
export OPENAI_API_KEY="sk-..."
export API_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode"
export OPENAI_MODEL="qwen-plus"
make daily-report
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key (priority 1) | - |
| `OPENAI_API_KEY` | OpenAI-compatible API key (priority 2) | - |
| `API_BASE_URL` / `OPENAI_BASE_URL` | Custom API server URL | Anthropic: `https://api.anthropic.com`, OpenAI: `https://api.openai.com` |
| `CLAUDE_MODEL` | Anthropic model name | `claude-opus-4-6` |
| `OPENAI_MODEL` | OpenAI-compatible model name | `gpt-4o` |

**Output**: `docs/daily-reports/YYYY-MM-DD.md`

**Note**: Daily reports contain sensitive information (IPs, costs) and are excluded from git (.gitignore).

## Git Workflow

The repository uses Conventional Commits format. All branches should follow the pattern:
- `test/mainnet-phase1` - test/feature branches
- `main` - production release branch

Terraform state files (terraform.tfstate*) are committed to git for infrastructure version tracking. Do not remove from .gitignore.
