# TRH Platform

This repository contains the TRH Platform, which uses Docker Compose to orchestrate a backend, frontend, and a PostgreSQL database.

## Project Structure

- `docker compose.yml`: Orchestrates the services (frontend, backend, database)
- `Makefile`: Provides convenient commands for managing the application
- `setup.sh`: Script to configure the backend container
- `config/`: Contains environment variable templates for backend and frontend
- `README.md`: Project documentation

## Prerequisites

### For Local Development

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- [Make](https://www.gnu.org/software/make/) (usually pre-installed on Linux/macOS)

### For EC2 Deployment

- [AWS CLI](https://aws.amazon.com/cli/) (will be automatically installed via `install.sh` on EC2 instance)
- [Terraform](https://www.terraform.io/) (will be automatically installed via `install.sh` on EC2 instance)
- AWS Account with appropriate permissions
- AWS Access Key ID and Secret Access Key

## Quick Start

### Option 1: Using Make (Recommended)

The easiest way to get started is using the provided Makefile:

```bash
# Clone the repository
git clone <your-repo-url>
cd trh-platform

# Configure environment variables (see Configuration section below)
# Then run the complete setup
make setup
```

**Note**: If you encounter permission issues when running `make setup`, you may need to use `sudo`:

```bash
sudo make setup
```

This single command will:
1. Start all services with `docker compose up -d`
2. Run the setup script to configure the backend container

### Option 2: Manual Setup

If you prefer to run commands manually:

```bash
# Start services
docker compose up -d

# Run setup script
./setup.sh
```

## Configuration

### Environment Variables

Copy the provided environment variable templates and adjust as needed:

```bash
cp config/env.backend.template config/.env.backend
cp config/env.frontend.template config/.env.frontend
```

Edit `config/.env.backend` and `config/.env.frontend` to match your local setup if necessary.

#### Example: `config/.env.backend`

```
PORT=8000
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=trh_db
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
```

#### Example: `config/.env.frontend`

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

**Important**: Replace `http://localhost:8000` with the actual backend URL where your service is running:

- **Local development**: `http://localhost:8000`
- **EC2 instance**: `http://your-ec2-ip:8000` or `http://your-ec2-domain:8000`
- **Production domain**: `https://your-backend-domain.com`
- **Docker on remote server**: `http://remote-server-ip:8000`

Make sure the frontend can reach the backend at the specified URL.

## Available Make Commands

The Makefile provides several convenient commands for managing the application:

### Local Development Commands

```bash
make help      # Show all available commands
make setup     # Start services and run setup script (recommended)
make up        # Start all services with docker compose up -d
make update    # Pull latest Docker images and restart services
make down      # Stop all services with docker compose down
make logs      # Show logs from all services
make status    # Show status of running containers
make clean     # Stop services and remove volumes
make config    # Configure environment variables interactively
```

### EC2 Deployment Commands

```bash
make ec2-deploy  # Deploy to AWS EC2 (includes automatic setup if needed)
make ec2-update  # Update TRH Platform on running EC2 instance
make ec2-destroy # Destroy EC2 infrastructure
make ec2-status  # Show current EC2 infrastructure status
make ec2-setup   # Manual setup (optional - called automatically by ec2-deploy)
make ec2-clean   # Clean up Terraform state and files
```

## EC2 Deployment

### Quick EC2 Deployment

The simplest way to deploy to AWS EC2 is using the integrated workflow:

```bash
# Single command deployment - handles everything automatically
make ec2-deploy
```

This command will:
1. **Automatically detect** if AWS credentials are configured
2. **Run EC2 setup** if needed (prompts for AWS credentials and SSH key configuration)
3. **Deploy infrastructure** using Terraform
4. **Show deployment details** including IP address and connection info

### What You'll Need

- AWS Account with appropriate permissions
- AWS Access Key ID and Secret Access Key
- Preferred AWS region (defaults to `ap-northeast-2`)

**Note**: AWS CLI and Terraform are automatically installed on the EC2 instance during deployment via the `install.sh` script. For local deployment operations, these tools will be automatically installed if missing when running EC2-related commands.

### First Time Setup

When you run `make ec2-deploy` for the first time, you'll be prompted for:

1. **AWS Credentials**:
   - AWS Access Key ID
   - AWS Secret Access Key (input hidden)
   - AWS Region (default: ap-northeast-2)

2. **SSH Configuration**:
   - SSH Key Pair Name (required - no default to avoid AWS conflicts)

3. **Instance Configuration**:
   - Instance Type (default: t2.large)
   - Instance Name (default: trh-platform-ec2)

### Subsequent Deployments

After the first setup, `make ec2-deploy` will:
- Use your saved AWS credentials
- Skip setup if already configured
- Only prompt for instance configuration

### Updating EC2 Instance

To update the TRH Platform on a running EC2 instance:

```bash
make ec2-update
```

This command will:
1. Connect to the EC2 instance via SSH
2. Fetch the latest code from the repository
3. Pull the latest Docker images
4. Restart services if new images are available
5. Skip unnecessary restarts if images are already up-to-date

**Note**: The update command intelligently checks if Docker images need updating. If all images are already up-to-date, it will skip the restart process to minimize downtime.

### Manual Setup (Optional)

If you prefer to configure AWS credentials separately:

```bash
# Run setup manually first
make ec2-setup

# Then deploy
make ec2-deploy
```

## Accessing the Application

Once the services are running:

- **Backend**: [http://localhost:8000](http://localhost:8000)
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **PostgreSQL**: Running on port 5432

## Stopping the Application

### Using Make:
```bash
make down
```

### Manual:
```bash
docker compose down
```

## Notes

- Data for PostgreSQL is persisted in a Docker volume (`postgres_data`).
- Make sure the ports `3000`, `8000`, and `5432` are available on your machine.
- The setup script configures the backend container with necessary dependencies and tools.

## License

