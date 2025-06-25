# TRH App

This repository contains the TRH App, which uses Docker Compose to orchestrate a backend, frontend, and a PostgreSQL database.

## Project Structure

- `docker-compose.yml`: Orchestrates the services (frontend, backend, database)
- `Makefile`: Provides convenient commands for managing the application
- `setup.sh`: Script to configure the backend container
- `config/`: Contains environment variable templates for backend and frontend
- `README.md`: Project documentation

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- [Make](https://www.gnu.org/software/make/) (usually pre-installed on Linux/macOS)

## Quick Start

### Option 1: Using Make (Recommended)

The easiest way to get started is using the provided Makefile:

```bash
# Clone the repository
git clone <your-repo-url>
cd trh-app

# Configure environment variables (see Configuration section below)
# Then run the complete setup
make setup
```

This single command will:
1. Start all services with `docker-compose up -d`
2. Run the setup script to configure the backend container

### Option 2: Manual Setup

If you prefer to run commands manually:

```bash
# Start services
docker-compose up -d

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

## Available Make Commands

The Makefile provides several convenient commands for managing the application:

```bash
make help      # Show all available commands
make setup     # Start services and run setup script (recommended)
make up        # Start all services with docker-compose up -d
make down      # Stop all services with docker-compose down
make logs      # Show logs from all services
make status    # Show status of running containers
make clean     # Stop services and remove volumes
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
docker-compose down
```

## Notes

- Data for PostgreSQL is persisted in a Docker volume (`postgres_data`).
- Make sure the ports `3000`, `8000`, and `5432` are available on your machine.
- The setup script configures the backend container with necessary dependencies and tools.

## License

Add your license information here.
