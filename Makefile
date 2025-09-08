.PHONY: help up down setup clean logs status config ec2-setup ec2-deploy ec2-destroy ec2-status ec2-clean

# Default target
help:
	@echo "Available commands:"
	@echo ""
	@echo "🐳 Docker Commands:"
	@echo "  make up      - Start all services with docker compose up -d"
	@echo "  make down    - Stop all services with docker compose down"
	@echo "  make setup   - Run docker compose up -d and then ./setup.sh"
	@echo "  make logs    - Show logs from all services"
	@echo "  make status  - Show status of running containers"
	@echo "  make clean   - Stop services and remove volumes"
	@echo "  make config  - Configure environment variables interactively"
	@echo ""
	@echo "☁️  EC2 Commands:"
	@echo "  make ec2-deploy  - Deploy EC2 infrastructure (includes automatic setup if needed)"
	@echo "  make ec2-setup   - Setup SSH keys and AWS configuration manually (optional - called automatically by ec2-deploy)"
	@echo "  make ec2-destroy - Destroy EC2 infrastructure (uses configured credentials, no confirmations)"
	@echo "  make ec2-status  - Show current EC2 infrastructure status"
	@echo "  make ec2-clean   - Clean up Terraform state and files"

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

# ========================================
# EC2 Infrastructure Commands
# ========================================

# Setup SSH keys and AWS configuration
ec2-setup:
	@echo "🔧 Setting up EC2 infrastructure prerequisites..."
	@echo "Please provide your AWS credentials and SSH key configuration:"
	@echo ""
	@bash -c 'read -p "AWS Access Key ID: " aws_access_key; \
	echo -n "AWS Secret Access Key (input will be hidden): "; \
	read -s aws_secret_key; \
	echo ""; \
	read -p "AWS Region [ap-northeast-2]: " aws_region; \
	aws_region=$${aws_region:-ap-northeast-2}; \
	while [ -z "$$key_pair_name" ]; do \
		read -p "SSH Key Pair Name (required): " key_pair_name; \
		if [ -z "$$key_pair_name" ]; then \
			echo "❌ SSH Key Pair Name is required. Please try again."; \
		fi; \
	done; \
	echo "🔐 Configuring AWS credentials..."; \
	aws configure set aws_access_key_id "$$aws_access_key"; \
	aws configure set aws_secret_access_key "$$aws_secret_key"; \
	aws configure set default.region "$$aws_region"; \
	aws configure set default.output "json"; \
	echo "🧪 Testing AWS configuration..."; \
	if aws sts get-caller-identity >/dev/null 2>&1; then \
		echo "✅ AWS CLI configured successfully"; \
		AWS_ACCOUNT=$$(aws sts get-caller-identity --query Account --output text); \
		AWS_USER=$$(aws sts get-caller-identity --query Arn --output text); \
		echo "📊 Connected as: $$AWS_USER"; \
		echo "🏢 Account ID: $$AWS_ACCOUNT"; \
		echo "🔍 Validating SSH key pair name in AWS..."; \
		while aws ec2 describe-key-pairs --key-names "$$key_pair_name" >/dev/null 2>&1; do \
			echo "⚠️  AWS key pair '\''$$key_pair_name'\'' already exists in your AWS account."; \
			read -p "Please enter a different key pair name: " key_pair_name; \
			if [ -z "$$key_pair_name" ]; then \
				echo "❌ Key pair name cannot be empty. Please try again."; \
				key_pair_name="trh-platform-key"; \
			fi; \
		done; \
		echo "✅ Key pair name '\''$$key_pair_name'\'' is available in AWS"; \
		echo "🔑 Setting up SSH keys and environment..."; \
		cd ec2 && chmod +x setup.sh && ./setup.sh "$$aws_access_key" "$$aws_secret_key" "$$aws_region" "$$key_pair_name"; \
		echo "✅ EC2 setup completed!"; \
	else \
		echo "❌ AWS configuration test failed. Please check your credentials."; \
		exit 1; \
	fi'

# Deploy EC2 infrastructure (includes setup if needed)
ec2-deploy:
	@echo "☁️  Deploying EC2 infrastructure..."
	@echo "🧪 Checking AWS configuration..."
	@# Check if AWS credentials are configured and environment file exists
	@if ! aws sts get-caller-identity >/dev/null 2>&1 || [ ! -f ec2/.env ]; then \
		echo "⚙️  AWS credentials not configured or EC2 environment not set up."; \
		echo "🔧 Running EC2 setup automatically..."; \
		echo ""; \
		$(MAKE) ec2-setup; \
		echo ""; \
		echo "✅ EC2 setup completed. Continuing with deployment..."; \
		echo ""; \
	fi
	@AWS_USER=$$(aws sts get-caller-identity --query Arn --output text); \
	echo "✅ Using AWS credentials for: $$AWS_USER"; \
	echo ""
	@echo "📋 Infrastructure Configuration:"
	@bash -c 'read -p "Instance Type [t2.large]: " instance_type; \
	instance_type=$${instance_type:-t2.large}; \
	read -p "Instance Name [trh-platform-ec2]: " instance_name; \
	instance_name=$${instance_name:-trh-platform-ec2}; \
	echo ""; \
	. ec2/.env; \
	export TF_VAR_instance_type=$$instance_type; \
	export TF_VAR_instance_name=$$instance_name; \
	export TF_VAR_key_pair_name=$$KEY_PAIR_NAME; \
	export TF_VAR_public_key_path=$$HOME/.ssh/$$KEY_PAIR_NAME.pub; \
	echo "📝 Writing environment variables to .env file..."; \
	echo "TF_VAR_instance_type=$$instance_type" > ec2/.env; \
	echo "TF_VAR_instance_name=$$instance_name" >> ec2/.env; \
	echo "TF_VAR_key_pair_name=$$KEY_PAIR_NAME" >> ec2/.env; \
	echo "TF_VAR_public_key_path=$$HOME/.ssh/$$KEY_PAIR_NAME.pub" >> ec2/.env; \
	echo "🔑 Using SSH key pair: $$KEY_PAIR_NAME"; \
	echo "🔑 Using public key path: $$HOME/.ssh/$$KEY_PAIR_NAME.pub"; \
	echo "🏗️  Initializing Terraform..."; \
	cd ec2 && terraform init; \
	echo "📋 Planning infrastructure..."; \
	terraform plan; \
	echo "🚀 Applying infrastructure changes..."; \
	terraform apply -auto-approve; \
	echo "✅ EC2 infrastructure deployed successfully!"; \
	echo ""; \
	echo "📊 Infrastructure Details:"; \
	terraform output'

# Destroy EC2 infrastructure using configured AWS credentials
ec2-destroy:
	@echo "💥 Destroying EC2 infrastructure..."
	@echo "⚠️  WARNING: This will permanently delete your EC2 infrastructure!"
	@echo ""
	@echo "🧪 Checking AWS configuration..."
	@if ! aws sts get-caller-identity >/dev/null 2>&1; then \
		echo "❌ AWS credentials not configured or invalid."; \
		echo "💡 Please run 'make ec2-setup' first to configure AWS credentials."; \
		exit 1; \
	fi
	@AWS_USER=$$(aws sts get-caller-identity --query Arn --output text); \
	echo "✅ Using AWS credentials for: $$AWS_USER"; \
	echo ""
	@echo "📋 Loading environment variables from .env file..."; \
	if [ -f ec2/.env ]; then \
		. ec2/.env; \
		echo "✅ Environment variables loaded from .env file"; \
		echo "🔧 Exported variables:"; \
		echo "   - TF_VAR_instance_type: $$TF_VAR_instance_type"; \
		echo "   - TF_VAR_instance_name: $$TF_VAR_instance_name"; \
		echo "   - TF_VAR_key_pair_name: $$TF_VAR_key_pair_name"; \
		echo "   - TF_VAR_public_key_path: $$TF_VAR_public_key_path"; \
		echo ""; \
		echo "📋 Planning destruction..."; \
		cd ec2 && \
		export TF_VAR_instance_type="$$TF_VAR_instance_type" && \
		export TF_VAR_instance_name="$$TF_VAR_instance_name" && \
		export TF_VAR_key_pair_name="$$TF_VAR_key_pair_name" && \
		export TF_VAR_public_key_path="$$TF_VAR_public_key_path" && \
		terraform plan -destroy; \
		echo "💥 Destroying infrastructure..."; \
		terraform destroy -auto-approve; \
		echo "✅ EC2 infrastructure destroyed successfully!"; \
	else \
		echo "⚠️  No .env file found. Using default values."; \
		echo ""; \
		echo "📋 Planning destruction..."; \
		cd ec2 && terraform plan -destroy; \
		echo "💥 Destroying infrastructure..."; \
		terraform destroy -auto-approve; \
		echo "✅ EC2 infrastructure destroyed successfully!"; \
	fi
	@echo "Deleting .env file..."; \
	rm -f ec2/.env; \
	echo "✅ .env file deleted successfully!"; \
	echo "Deleting Terraform state files..."; \
	
	rm -f ec2/terraform.tfstate; \
	rm -f ec2/terraform.tfstate.backup; \
	rm -f ec2/.terraform.lock.hcl; \
	rm -rf ec2/.terraform; \
	echo "✅ Terraform state files deleted successfully!"; \

# Show current EC2 infrastructure status
ec2-status:
	@echo "📊 Checking EC2 infrastructure status..."
	@echo "📋 Loading environment variables from .env file..."; \
	if [ -f ec2/.env ]; then \
		. ec2/.env; \
		echo "✅ Environment variables loaded from .env file"; \
		echo "🔧 Exported variables:"; \
		echo "   - TF_VAR_instance_type: $$TF_VAR_instance_type"; \
		echo "   - TF_VAR_instance_name: $$TF_VAR_instance_name"; \
		echo "   - TF_VAR_key_pair_name: $$TF_VAR_key_pair_name"; \
		echo "   - TF_VAR_public_key_path: $$TF_VAR_public_key_path"; \
		echo ""; \
		if [ -f ec2/terraform.tfstate ]; then \
			echo "📁 Terraform state file found"; \
			echo ""; \
			echo "🏗️  Current Infrastructure:"; \
			(cd ec2 && \
			export TF_VAR_instance_type="$$TF_VAR_instance_type" && \
			export TF_VAR_instance_name="$$TF_VAR_instance_name" && \
			export TF_VAR_key_pair_name="$$TF_VAR_key_pair_name" && \
			export TF_VAR_public_key_path="$$TF_VAR_public_key_path" && \
			terraform show -json | jq -r '.values.root_module.resources[]? | select(.type=="aws_instance") | "Instance: \(.values.tags.Name // "unnamed") (\(.values.instance_type)) - \(.values.instance_state)"' 2>/dev/null) || echo "No instances found or jq not available"; \
			echo ""; \
			echo "📋 Terraform Outputs:"; \
			(cd ec2 && \
			export TF_VAR_instance_type="$$TF_VAR_instance_type" && \
			export TF_VAR_instance_name="$$TF_VAR_instance_name" && \
			export TF_VAR_key_pair_name="$$TF_VAR_key_pair_name" && \
			export TF_VAR_public_key_path="$$TF_VAR_public_key_path" && \
			terraform output 2>/dev/null) || echo "No outputs available"; \
		else \
			echo "❌ No Terraform state found. Infrastructure may not be deployed."; \
		fi; \
	else \
		echo "⚠️  No .env file found. Using default values."; \
		echo ""; \
		if [ -f ec2/terraform.tfstate ]; then \
			echo "📁 Terraform state file found"; \
			echo ""; \
			echo "🏗️  Current Infrastructure:"; \
			(cd ec2 && terraform show -json | jq -r '.values.root_module.resources[]? | select(.type=="aws_instance") | "Instance: \(.values.tags.Name // "unnamed") (\(.values.instance_type)) - \(.values.instance_state)"' 2>/dev/null) || echo "No instances found or jq not available"; \
			echo ""; \
			echo "📋 Terraform Outputs:"; \
			(cd ec2 && terraform output 2>/dev/null) || echo "No outputs available"; \
		else \
			echo "❌ No Terraform state found. Infrastructure may not be deployed."; \
		fi; \
	fi

# Clean up Terraform state and temporary files
ec2-clean:
	@echo "🧹 Cleaning up EC2 Terraform files..."
	@echo "⚠️  This will remove Terraform state files and temporary files."
	@echo "⚠️  Make sure to destroy infrastructure first if it exists!"
	@echo ""
	@read -p "Are you sure you want to clean up? (yes/no): " confirm; \
	if [ "$$confirm" = "yes" ]; then \
		cd ec2 && rm -rf .terraform .terraform.lock.hcl terraform.tfstate terraform.tfstate.backup .env 2>/dev/null || true; \
		echo "✅ Cleanup completed!"; \
	else \
		echo "❌ Cleanup cancelled."; \
	fi 