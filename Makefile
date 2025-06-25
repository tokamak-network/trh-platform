.PHONY: help up down setup clean logs status

# Default target
help:
	@echo "Available commands:"
	@echo "  make up      - Start all services with docker-compose up -d"
	@echo "  make down    - Stop all services with docker-compose down"
	@echo "  make setup   - Run docker-compose up -d and then ./setup.sh"
	@echo "  make logs    - Show logs from all services"
	@echo "  make status  - Show status of running containers"
	@echo "  make clean   - Stop services and remove volumes"

# Start all services in detached mode
up:
	@echo "🚀 Starting TRH services..."
	docker-compose up -d
	@echo "✅ Services started successfully!"

# Stop all services
down:
	@echo "🛑 Stopping TRH services..."
	docker-compose down
	@echo "✅ Services stopped successfully!"

# Main setup target - starts services and runs setup script
setup: up
	@echo "🔧 Running setup script..."
	@chmod +x ./setup.sh
	./setup.sh
	@echo "🎉 Setup completed successfully!"

# Show logs from all services
logs:
	docker-compose logs -f

# Show status of running containers
status:
	@echo "📊 Container Status:"
	docker-compose ps

# Clean up - stop services and remove volumes
clean:
	@echo "🧹 Cleaning up TRH services..."
	docker-compose down -v
	@echo "✅ Cleanup completed!" 