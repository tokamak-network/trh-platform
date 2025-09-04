.PHONY: help up down setup clean logs status config

# Default target
help:
	@echo "Available commands:"
	@echo "  make up      - Start all services with docker compose up -d"
	@echo "  make down    - Stop all services with docker compose down"
	@echo "  make setup   - Run docker compose up -d and then ./setup.sh"
	@echo "  make logs    - Show logs from all services"
	@echo "  make status  - Show status of running containers"
	@echo "  make clean   - Stop services and remove volumes"
	@echo "  make config  - Configure environment variables interactively"

# Start all services in detached mode
up:
	@echo "🚀 Starting TRH services..."
	docker compose pull
	docker compose up -d
	@echo "✅ Services started successfully!"

# Stop all services
down:
	@echo "🛑 Stopping TRH services..."
	docker compose down
	@echo "✅ Services stopped successfully!"

# Main setup target - starts services and runs setup script
setup: up
	@echo "🔧 Running setup script..."
	@chmod +x ./setup.sh
	./setup.sh
	@echo "🎉 Setup completed successfully!"

# Show logs from all services
logs:
	docker compose logs -f

# Show status of running containers
status:
	@echo "📊 Container Status:"
	docker compose ps

# Clean up - stop services and remove volumes
clean:
	@echo "🧹 Cleaning up TRH services..."
	docker compose down -v
	@echo "✅ Cleanup completed!"

# Configure environment variables interactively
config:
	@echo "🔧 Configuring environment variables..."
	@echo "Press Enter to use default values shown in brackets"
	@echo ""
	@# Copy template files
	@cp config/env.backend.template config/.env.backend
	@cp config/env.frontend.template config/.env.frontend
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
	@echo "   - config/.env.frontend"
	@echo "   - config/.env.backend" 