# TRH Platform

This repository contains the TRH Platform, which uses Docker Compose to orchestrate a backend, frontend, and a PostgreSQL database.

## Project Structure

- `docker-compose.yml`: Orchestrates the services (frontend, backend, database)
- `Makefile`: Provides convenient commands for managing the application
- `setup.sh`: Script to configure the backend container
- `config/`: Contains environment variable templates for backend and frontend
- `README.md`: Project documentation

## Quick Start

### Local Development

```bash
# Clone and setup
git clone <your-repo-url>
cd trh-platform
make setup
```

**Prerequisites**: Docker, Docker Compose, Make

### EC2 Deployment

```bash
# Single command deployment
make ec2-deploy
```

**Prerequisites**: AWS Account, AWS Access Key ID/Secret

On first run, you'll be prompted for:
- AWS Credentials (Access Key ID, Secret Access Key, Region)
- SSH Key Pair Name
- Instance Type (default: t2.large)
- Instance Name (default: trh-platform-ec2)

## Available Commands

### Local Development
```bash
make setup    # Start services and setup (recommended)
make up       # Start services
make down     # Stop services
make logs     # Show logs
make status   # Show container status
make clean    # Stop and remove volumes
```

### EC2 Deployment
```bash
make ec2-deploy   # Deploy to AWS EC2
make ec2-update   # Update running instance
make ec2-destroy  # Destroy infrastructure
make ec2-status   # Show infrastructure status
make ec2-clean    # Clean up Terraform state (use when deployment fails)
```

## Configuration

Environment variables are configured via templates:

### Docker Image Versions
```bash
cp config/env.docker.template config/.env.docker
```
This configures which versions of the backend and UI Docker images to use. Default: `v1.0.1-alpha` for backend, `1.0.0` for UI

### Service Configuration
```bash
cp config/env.backend.template config/.env.backend
cp config/env.frontend.template config/.env.frontend
```

**Important**: Update `NEXT_PUBLIC_API_BASE_URL` in `config/.env.frontend`:
- Local: `http://localhost:8000`
- EC2: `http://<instance-ip>:8000`

## Troubleshooting

### Deployment Failures

If `make ec2-deploy` fails:

```bash
# Check if resources exist
make ec2-status

# If resources exist, destroy them first
make ec2-destroy

# Clean up state and retry
make ec2-clean
make ec2-deploy
```

### Destroy Failures - AWS Credentials Mismatch

If `make ec2-destroy` fails due to credentials mismatch:

1. Verify current credentials: `aws sts get-caller-identity`
2. Configure correct credentials: Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables while `aws configure`
3. Retry: `make ec2-destroy`

**Note**: You must use the same AWS credentials that created the resources.

### If account info cannot be read from state

When the Terraform state has no account info (ARN missing) and destroy cannot proceed:

**Find resource IDs via AWS CLI**
```bash
# Instance ID by Name tag (replace with your instance name)
aws ec2 describe-instances --filters "Name=tag:Name,Values=<instance-name>" \
  --query "Reservations[].Instances[].InstanceId" --output text

# Security Group ID by name prefix (replace with your SG prefix if customized)
aws ec2 describe-security-groups --filters "Name=group-name,Values=<sg-name-or-prefix>*" \
  --query "SecurityGroups[].GroupId" --output text

# Key Pair name (list and pick the one you used)
aws ec2 describe-key-pairs --query "KeyPairs[].KeyName" --output text
```

**Terminate resources manually (if needed)**
- From AWS Console **or** CLI:
  ```bash
  aws ec2 terminate-instances --instance-ids <instance-id>
  ```
- Delete related resources if present:
  ```bash
  aws ec2 delete-security-group --group-id <sg-id>
  aws ec2 delete-key-pair --key-name <key-name>
  ```
- Then clean local state:
  ```bash
  make ec2-clean
  ```

## Access

- **Backend**: http://localhost:8000
- **Frontend**: http://localhost:3000
- **PostgreSQL**: localhost:5432
