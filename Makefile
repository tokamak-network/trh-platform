.PHONY: help up update down setup clean logs status config ensure-volumes dev-build-backend dev-build-frontend

# Default target
help:
	@echo "Available commands:"
	@echo ""
	@echo "🐳 Docker Commands:"
	@echo "  make up      - Start all services with docker compose up -d"
	@echo "  make update  - Pull latest Docker images and restart services"
	@echo "  make down    - Stop all services with docker compose down"
	@echo "  make setup   - Run docker compose up -d and then ./setup.sh"
	@echo "  make logs    - Show logs from all services"
	@echo "  make status  - Show status of running containers"
	@echo "  make clean   - Stop services and remove volumes"
	@echo "  make config  - Configure environment variables interactively"
	@echo ""
	@echo "🛠️  Local Dev Commands (skip registry push/pull):"
	@echo "  make dev-build-backend   - Build backend image locally and restart container"
	@echo "  make dev-build-frontend  - Build frontend image locally and restart container"

# Ensure required external Docker volumes exist
ensure-volumes:
	@docker volume inspect trh_backend_storage > /dev/null 2>&1 || \
		(echo "📦 Creating external volume trh_backend_storage..." && docker volume create trh_backend_storage)

# Start all services in detached mode
up: ensure-volumes
	@echo "🚀 Starting TRH services..."
	@if [ ! -f config/.env.docker ]; then \
		echo "📋 Creating config/.env.docker file from template..."; \
		cp config/env.docker.template config/.env.docker; \
	fi
	docker compose --env-file config/.env.docker up -d
	@echo "✅ Services started successfully!"

# Update services with latest images
update: ensure-volumes
	@echo "🔄 Checking for image updates..."
	@if [ ! -f config/.env.docker ]; then \
		echo "📋 Creating config/.env.docker file from template..."; \
		cp config/env.docker.template config/.env.docker; \
	fi
	docker compose --env-file config/.env.docker pull
	docker compose --env-file config/.env.docker up -d
	@echo "✅ Services updated successfully!"

# Stop all services
down:
	@echo "Warning: This will stop and remove all platform containers. Data may be lost."
	@read -p "Are you sure you want to proceed? [y/N]: " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		echo "🛑 Stopping TRH services..."; \
		docker compose --env-file config/.env.docker down; \
		echo "✅ Services stopped successfully!"; \
	else \
		echo "Operation cancelled."; \
		exit 1; \
	fi

# Main setup target - starts services and runs setup script
setup: up
	@echo "🔧 Running setup script..."
	@chmod +x ./setup.sh
	./setup.sh
	@echo "🎉 Setup completed successfully!"

# Show logs from all services
logs:
	docker compose --env-file config/.env.docker logs -f

# Show status of running containers
status:
	@echo "📊 Container Status:"
	docker compose --env-file config/.env.docker ps

# Clean up - stop services and remove volumes
clean:
	@echo "🧹 Cleaning up TRH services..."
	docker compose --env-file config/.env.docker down -v
	@echo "✅ Cleanup completed!"

# Build backend image locally and restart container (skip registry push/pull)
dev-build-backend:
	@echo "🔨 Building backend image locally..."
	cd ../trh-backend && docker build -t tokamaknetwork/trh-backend:latest .
	@echo "🔄 Restarting backend container..."
	docker compose -f resources/docker-compose.yml restart backend
	@echo "✅ Backend updated!"

# Build frontend image locally and restart container (skip registry push/pull)
dev-build-frontend:
	@echo "🔨 Building frontend image locally..."
	cd ../trh-platform-ui && docker build -t tokamaknetwork/trh-platform-ui:latest .
	@echo "🔄 Restarting frontend container..."
	docker compose -f resources/docker-compose.yml restart platform-ui
	@echo "✅ Frontend updated!"

# Configure environment variables interactively
config:
	@echo "🔧 Configuring environment variables..."
	@echo "Press Enter to use default values shown in brackets"
	@echo ""
	@# Copy template files
	@cp config/env.backend.template config/.env.backend
	@cp config/env.frontend.template config/.env.frontend
	@cp config/env.docker.template config/.env.docker
	@echo "📋 Template files copied successfully!"
	@echo ""
	@# Frontend configuration
	@echo "=== Frontend Configuration ==="
	@read -p "API Base URL [http://localhost:8000]: " api_url; \
	api_url=$${api_url:-http://localhost:8000}; \
	sed -i'' -e "s|^NEXT_PUBLIC_API_BASE_URL=.*|NEXT_PUBLIC_API_BASE_URL=$$api_url|" config/.env.frontend
	@echo ""
	@# Backend configuration
	@echo "=== Backend Configuration ==="
	@read -p "Default Admin Email [admin@gmail.com]: " admin_email; \
	admin_email=$${admin_email:-admin@gmail.com}; \
	sed -i'' -e "s|^DEFAULT_ADMIN_EMAIL=.*|DEFAULT_ADMIN_EMAIL=$$admin_email|" config/.env.backend
	@read -p "Default Admin Password [admin]: " admin_password; \
	admin_password=$${admin_password:-admin}; \
	sed -i'' -e "s|^DEFAULT_ADMIN_PASSWORD=.*|DEFAULT_ADMIN_PASSWORD=$$admin_password|" config/.env.backend
	@echo ""
	@echo "✅ Environment variables configured successfully!"
	@echo "📁 Configuration files created:"
	@echo "   - config/.env.docker"
	@echo "   - config/.env.frontend"
	@echo "   - config/.env.backend"

