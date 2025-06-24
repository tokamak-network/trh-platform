# TRH App

This repository contains the TRH App, which uses Docker Compose to orchestrate a backend, frontend, and a PostgreSQL database.

## Project Structure

- `docker-compose.yml`: Orchestrates the services (frontend, backend, database)
- `config/`: Contains environment variable templates for backend and frontend
- `README.md`: Project documentation

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Setup Guide

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd trh-app
```

### 2. Configure Environment Variables

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

### 3. Start the Application

Run the following command to start all services:

```bash
docker-compose up --build
```

- The backend will be available at [http://localhost:8000](http://localhost:8000)
- The frontend will be available at [http://localhost:3000](http://localhost:3000)
- PostgreSQL will be running on port 5432

### 4. Stopping the Application

To stop the services, press `Ctrl+C` in the terminal where Docker Compose is running, then:

```bash
docker-compose down
```

## Notes

- Data for PostgreSQL is persisted in a Docker volume (`postgres_data`).
- Make sure the ports `3000`, `8000`, and `5432` are available on your machine.

## License

Add your license information here.
