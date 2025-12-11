.PHONY: help up update down setup clean logs status config ec2-setup ec2-deploy ec2-destroy ec2-status ec2-clean

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
	@echo "☁️  EC2 Commands:"
	@echo "  make ec2-deploy  - Deploy EC2 infrastructure with automatic TRH Platform setup"
	@echo "                     (includes SSH keys, AWS config, admin credentials, repository cloning, and platform setup)"
	@echo "  make ec2-setup   - Setup SSH keys and AWS configuration manually (optional - called automatically by ec2-deploy)"
	@echo "  make ec2-update  - Update TRH Platform on running EC2 instance"
	@echo "  make ec2-destroy - Destroy EC2 infrastructure (uses configured credentials, no confirmations)"
	@echo "  make ec2-status  - Show current EC2 infrastructure status"
	@echo "  make ec2-clean   - Clean up Terraform state and files"

# Start all services in detached mode
up:
	@echo "🚀 Starting TRH services..."
	docker compose up -d
	@echo "✅ Services started successfully!"

# Update services with latest images
update:
	@echo "🔄 Checking for image updates..."
	docker compose pull
	docker compose up -d
	@echo "✅ Services updated successfully!"

# Stop all services
down:
	@echo "Warning: This will stop and remove all platform containers. Data may be lost."
	@read -p "Are you sure you want to proceed? [y/N]: " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		echo "🛑 Stopping TRH services..."; \
		docker compose down; \
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

# Deploy EC2 infrastructure with automatic TRH Platform setup
ec2-deploy:
	@echo "☁️  Deploying EC2 infrastructure with automatic TRH Platform setup..."
	@echo "This will:"
	@echo "  1. Provision EC2 instance with required tools (git, make, docker, AWS CLI, terraform)"
	@echo "  2. Clone https://github.com/tokamak-network/trh-platform repository"
	@echo "  3. Run 'make config' and 'make setup' automatically"
	@echo ""
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
	@echo "🔍 Checking for existing EC2 instance..."
	@if [ -f ec2/terraform.tfstate ]; then \
		INSTANCE_ID=$$(cd ec2 && terraform output -raw instance_id 2>/dev/null || echo ''); \
		if [ -z "$$INSTANCE_ID" ]; then \
			echo "❌ No instance_id found in existing Terraform state."; \
			echo "   The state file might be corrupted or from a failed deployment."; \
			echo "⚠️  Cannot proceed with deployment."; \
			echo ""; \
			echo "💡 If this is a new deployment, consider removing the 'ec2/terraform.tfstate' file and trying again."; \
			echo "💡 If this is a retry after a failed deployment, check the state file manually."; \
			exit 1; \
		else \
			echo "✅ Found existing instance in state: $$INSTANCE_ID"; \
		fi; \
	fi
	@echo ""
	@echo "📋 Infrastructure Configuration:"
	@bash -c 'read -p "Instance Type [t2.large]: " instance_type; \
	instance_type=$${instance_type:-t2.large}; \
	instance_type=$$(echo "$$instance_type" | tr -d "[:space:]"); \
	if [ -z "$$instance_type" ] || [ "$$instance_type" = "n" ] || [ "$$instance_type" = "N" ]; then \
		instance_type="t2.large"; \
		echo "⚠️  Invalid instance type, using default: t2.large"; \
	fi; \
	read -p "Instance Name [trh-platform-ec2]: " instance_name; \
	instance_name=$${instance_name:-trh-platform-ec2}; \
	instance_name=$$(echo "$$instance_name" | tr -d "[:space:]"); \
	if [ -z "$$instance_name" ]; then \
		instance_name="trh-platform-ec2"; \
	fi; \
	echo ""; \
	echo "=== Platform Admin Configuration ==="; \
	read -p "Admin Email [admin@gmail.com]: " admin_email; \
	admin_email=$${admin_email:-admin@gmail.com}; \
	admin_email=$$(echo "$$admin_email" | tr -d "[:space:]"); \
	if [ -z "$$admin_email" ]; then \
		admin_email="admin@gmail.com"; \
	fi; \
	read -p "Admin Password [admin]: " admin_password; \
	admin_password=$${admin_password:-admin}; \
	admin_password=$$(echo "$$admin_password" | tr -d "[:space:]"); \
	if [ -z "$$admin_password" ]; then \
		admin_password="admin"; \
	fi; \
	echo ""; \
	. ec2/.env; \
	if [ -z "$$KEY_PAIR_NAME" ]; then \
		echo "❌ KEY_PAIR_NAME not found in ec2/.env file."; \
		echo "💡 Please run '\''make ec2-setup'\'' first."; \
		exit 1; \
	fi; \
	export TF_VAR_instance_type="$$instance_type"; \
	export TF_VAR_instance_name="$$instance_name"; \
	export TF_VAR_key_pair_name="$$KEY_PAIR_NAME"; \
	export TF_VAR_public_key_path="$$HOME/.ssh/$$KEY_PAIR_NAME.pub"; \
	export TF_VAR_private_key_path="$$HOME/.ssh/$$KEY_PAIR_NAME"; \
	export TF_VAR_admin_email="$$admin_email"; \
	export TF_VAR_admin_password="$$admin_password"; \
	echo "📝 Writing environment variables to .env file..."; \
	echo "KEY_PAIR_NAME=$$KEY_PAIR_NAME" > ec2/.env; \
	echo "TF_VAR_instance_type=$$instance_type" >> ec2/.env; \
	echo "TF_VAR_instance_name=$$instance_name" >> ec2/.env; \
	echo "TF_VAR_key_pair_name=$$KEY_PAIR_NAME" >> ec2/.env; \
	echo "TF_VAR_public_key_path=$$HOME/.ssh/$$KEY_PAIR_NAME.pub" >> ec2/.env; \
	echo "TF_VAR_private_key_path=$$HOME/.ssh/$$KEY_PAIR_NAME" >> ec2/.env; \
	echo "TF_VAR_admin_email=$$admin_email" >> ec2/.env; \
	echo "TF_VAR_admin_password=$$admin_password" >> ec2/.env; \
	echo "🔑 Using SSH key pair: $$KEY_PAIR_NAME"; \
	echo "🔑 Using public key path: $$HOME/.ssh/$$KEY_PAIR_NAME.pub"; \
	echo "🔑 Using private key path: $$HOME/.ssh/$$KEY_PAIR_NAME"; \
	echo "🔧 Configuration:"; \
	echo "   - Instance Type: $$instance_type"; \
	echo "   - Instance Name: $$instance_name"; \
	echo "   - Admin Email: $$admin_email"; \
	echo "🏗️  Initializing Terraform..."; \
	cd ec2 && \
	if ! terraform init; then \
		echo "❌ Terraform initialization failed."; \
		echo "💡 Try removing .terraform directory and .terraform.lock.hcl, then run again."; \
		exit 1; \
	fi; \
	echo "📋 Planning infrastructure..."; \
	PLAN_OUTPUT=$$(terraform plan 2>&1); \
	PLAN_EXIT=$$?; \
	echo "$$PLAN_OUTPUT"; \
	if [ $$PLAN_EXIT -ne 0 ]; then \
		echo "❌ Terraform plan failed."; \
		echo "💡 If this is a retry after a failed deployment, you may need to:"; \
		echo "   1. Check for partially created resources in AWS"; \
		echo "   2. Remove or fix the terraform.tfstate file"; \
		echo "   3. Run '\''terraform refresh'\'' to sync state with AWS"; \
		exit 1; \
	fi; \
	if echo "$$PLAN_OUTPUT" | grep -q "Error:"; then \
		echo "❌ Terraform plan contains errors. Please fix them before proceeding."; \
		exit 1; \
	fi; \
	echo "🚀 Applying infrastructure changes..."; \
	echo "⏳ This may take 5-15 minutes. Please be patient..."; \
	echo "   - Instance creation: ~2-3 minutes"; \
	echo "   - Instance initialization: ~2-5 minutes"; \
	echo "   - Platform setup: ~5-10 minutes"; \
	echo ""; \
	echo "📋 Terraform output (real-time):"; \
	echo "────────────────────────────────────────"; \
	APPLY_EXIT=0; \
	terraform apply -auto-approve 2>&1 | tee /tmp/terraform_apply_output.log || APPLY_EXIT=$${PIPESTATUS[0]}; \
	echo "────────────────────────────────────────"; \
	APPLY_OUTPUT=$$(cat /tmp/terraform_apply_output.log 2>/dev/null || echo ""); \
	rm -f /tmp/terraform_apply_output.log; \
	if [ $$APPLY_EXIT -ne 0 ]; then \
			echo "❌ Terraform apply failed. Infrastructure deployment was not successful."; \
			echo ""; \
			if echo "$$APPLY_OUTPUT" | grep -q "remote-exec provisioner error"; then \
				echo "⚠️  Remote execution error detected. This usually means:"; \
				echo "   - SSH connection to the instance was interrupted"; \
				echo "   - Instance setup commands took too long (timeout)"; \
				echo "   - Network connectivity issues"; \
				echo ""; \
				echo "💡 Recovery options:"; \
				echo "   1. Check if the instance was created successfully:"; \
				echo "      - Run '\''make ec2-status'\'' to check instance status"; \
				echo "   2. If instance exists, you can manually complete the setup:"; \
				echo "      - SSH into the instance: ssh -i ~/.ssh/$$KEY_PAIR_NAME ubuntu@<INSTANCE_IP>"; \
				echo "      - Run the setup commands manually"; \
				echo "   3. To retry from scratch:"; \
				echo "      - Run '\''make ec2-destroy'\'' to clean up"; \
				echo "      - Then run '\''make ec2-deploy'\'' again"; \
			else \
				echo "💡 Recovery options:"; \
				echo "   1. Check the error messages above"; \
				echo "   2. Verify AWS resources were partially created:"; \
				echo "      - Security groups, key pairs, instances"; \
				echo "   3. To retry:"; \
				echo "      - If resources were created: Run '\''make ec2-destroy'\'' first, then retry"; \
				echo "      - If no resources were created: Simply run '\''make ec2-deploy'\'' again"; \
				echo "      - If state is corrupted: Remove ec2/terraform.tfstate and retry"; \
			fi; \
			exit 1; \
	fi; \
	echo "✅ EC2 infrastructure deployed successfully!"; \
	echo ""; \
	echo "📊 Infrastructure Details:"; \
	terraform output || echo "⚠️  Could not retrieve outputs (this may be normal if instance is still starting)"; \
	echo ""; \
	INSTANCE_IP=$$(terraform output -raw instance_public_ip 2>/dev/null || echo ""); \
	if [ -n "$$INSTANCE_IP" ]; then \
		echo "🚀 TRH Platform Setup:"; \
		echo "  ✓ Repository cloned to: /home/ubuntu/trh-platform"; \
		echo "  ✓ Platform configured and set up automatically"; \
		echo "  ✓ Admin Email: $$admin_email"; \
		echo "  ✓ Admin Password: $$admin_password"; \
		echo "  ✓ Services should be running on the instance"; \
		echo ""; \
		echo "📝 Next Steps:"; \
		echo "  1. SSH into the instance: ssh -i ~/.ssh/$$KEY_PAIR_NAME ubuntu@$$INSTANCE_IP"; \
		echo "  2. Check platform status: cd trh-platform && make status"; \
		echo "  3. View platform logs: cd trh-platform && make logs"; \
		echo "  4. Access platform dashboard at: http://$$INSTANCE_IP:3000"; \
	else \
		echo "⚠️  Could not retrieve instance IP. Instance may still be starting."; \
		echo "💡 You can check the instance status with: '\''make ec2-status'\''"; \
	fi'

# Update TRH Platform on EC2 instance
ec2-update:
	@echo "🔄 Updating TRH Platform on EC2..."
	@echo "🧪 Checking AWS configuration..."
	@if ! aws sts get-caller-identity >/dev/null 2>&1; then \
		echo "❌ AWS credentials not configured or invalid."; \
		exit 1; \
	fi
	@echo "📋 Loading environment variables from .env file..."; \
	if [ -f ec2/.env ]; then \
		. ec2/.env; \
		echo "✅ Environment variables loaded"; \
		echo "🔍 Getting instance IP..."; \
		INSTANCE_IP=$$(cd ec2 && terraform output -raw instance_public_ip 2>/dev/null); \
		if [ -z "$$INSTANCE_IP" ]; then \
			echo "❌ Could not get instance IP. Is the infrastructure deployed?"; \
			exit 1; \
		fi; \
		echo "✅ Instance IP: $$INSTANCE_IP"; \
		echo "🔐 Verifying SSH host key..."; \
		if ssh-keygen -F "$$INSTANCE_IP" -f ~/.ssh/known_hosts >/dev/null 2>&1; then \
			echo "⚠️  Host key already exists for $$INSTANCE_IP"; \
			echo "🔄 Testing connection with existing host key..."; \
			if ! ssh -o StrictHostKeyChecking=yes -o ConnectTimeout=5 -i ~/.ssh/$$TF_VAR_key_pair_name ubuntu@$$INSTANCE_IP "echo 'test'" >/dev/null 2>&1; then \
				echo "❌ Host key verification failed. Removing old key..."; \
				ssh-keygen -R "$$INSTANCE_IP" -f ~/.ssh/known_hosts >/dev/null 2>&1 || true; \
				echo "📝 Adding new host key to known_hosts..."; \
				ssh-keyscan -H "$$INSTANCE_IP" >> ~/.ssh/known_hosts 2>/dev/null || true; \
			else \
				echo "✅ Existing host key is valid"; \
			fi; \
		else \
			echo "📝 Adding host key to known_hosts..."; \
			ssh-keyscan -H "$$INSTANCE_IP" >> ~/.ssh/known_hosts 2>/dev/null || true; \
		fi; \
		echo "🚀 Connecting to instance to update..."; \
		ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=~/.ssh/known_hosts -i ~/.ssh/$$TF_VAR_key_pair_name ubuntu@$$INSTANCE_IP " \
			cd trh-platform && \
			echo '📥 Fetching latest code...' && \
			git fetch --all && \
			echo '🔄 Pulling latest changes from current branch...' && \
			git pull && \
			echo '🔄 Pulling latest Docker images...' && \
			PULL_OUTPUT=\$$(docker compose pull 2>&1) && \
			PULL_EXIT=\$$? && \
			echo \"\$$PULL_OUTPUT\" && \
			if [ \$$PULL_EXIT -ne 0 ]; then \
				echo '❌ Failed to pull Docker images. Exiting.' && \
				exit 1; \
			fi && \
			if echo \"\$$PULL_OUTPUT\" | grep -qiE 'Image is up to date|Already up to date'; then \
				echo 'ℹ️  All images are already up to date. No update needed.' && \
				(docker compose ps --format '{{.Image}}' 2>/dev/null || docker ps --format '{{.Image}}') | \
				sed 's/^/  /' && \
				exit 0; \
			elif echo \"\$$PULL_OUTPUT\" | grep -qE 'Downloaded newer image|Downloading'; then \
				echo '✅ New images downloaded. Restarting services...' && \
				docker compose up -d && \
				./setup.sh; \
			else \
				echo '⚠️  Could not determine if images were updated. Proceeding with restart to be safe...' && \
				docker compose up -d && \
				./setup.sh; \
			fi \
		"; \
		echo "✅ Update completed successfully!"; \
	else \
		echo "❌ ec2/.env file not found. Cannot determine configuration."; \
		exit 1; \
	fi

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
	AWS_ACCOUNT=$$(aws sts get-caller-identity --query Account --output text); \
	echo "✅ Using AWS credentials for: $$AWS_USER"; \
	echo "🏢 AWS Account ID: $$AWS_ACCOUNT"; \
	echo ""; \
	echo "🔍 Checking AWS account in Terraform state..."; \
	cd ec2 && \
	if [ -f terraform.tfstate ]; then \
		STATE_ACCOUNT=$$(terraform state show aws_key_pair.trh_platform_key 2>/dev/null | awk -F: '/arn:aws/ {print $$5; exit}' || echo ""); \
		if [ -z "$$STATE_ACCOUNT" ]; then \
			echo "❌ Could not determine AWS account from Terraform state."; \
			echo "   Please ensure the state contains resource ARNs or import resources before retrying."; \
			exit 1; \
		fi; \
		echo "   Terraform state account (from ARN): $$STATE_ACCOUNT"; \
		if [ "$$STATE_ACCOUNT" != "$$AWS_ACCOUNT" ]; then \
			echo "❌ AWS account mismatch detected between current credentials and Terraform state!"; \
			echo "   Current AWS Account: $$AWS_ACCOUNT"; \
			echo "   Terraform State Account: $$STATE_ACCOUNT"; \
			echo "   Please switch to the credentials that created the resources and rerun 'make ec2-destroy'."; \
			exit 1; \
		fi; \
	fi; \
	cd .. && \
	echo "✅ AWS account comparison completed."; \
	echo ""; \
	echo "📋 Loading environment variables from .env file..."; \
	if [ -f ec2/.env ]; then \
		. ec2/.env; \
		echo "✅ Environment variables loaded from .env file"; \
		echo "🔧 Exported variables:"; \
		echo "   - TF_VAR_instance_type: $$TF_VAR_instance_type"; \
		echo "   - TF_VAR_instance_name: $$TF_VAR_instance_name"; \
		echo "   - TF_VAR_key_pair_name: $$TF_VAR_key_pair_name"; \
		echo "   - TF_VAR_public_key_path: $$TF_VAR_public_key_path"; \
		echo ""; \
		cd ec2 && \
		export TF_VAR_instance_type="$$TF_VAR_instance_type" && \
		export TF_VAR_instance_name="$$TF_VAR_instance_name" && \
		export TF_VAR_key_pair_name="$$TF_VAR_key_pair_name" && \
		export TF_VAR_public_key_path="$$TF_VAR_public_key_path" && \
		if [ ! -f terraform.tfstate ]; then \
			echo "⚠️  No Terraform state file found. Infrastructure may already be destroyed."; \
			exit 0; \
		fi && \
		echo "🔄 Refreshing Terraform state to ensure accuracy..."; \
		HAS_RESOURCES=$$(terraform state list 2>/dev/null | wc -l | tr -d ' '); \
		REFRESH_OUTPUT=$$(terraform refresh 2>&1); \
		REFRESH_EXIT=$$?; \
		if [ $$REFRESH_EXIT -ne 0 ]; then \
			if echo "$$REFRESH_OUTPUT" | grep -qE "UnauthorizedOperation|AccessDenied|InvalidInstanceID|InvalidUserID|AuthFailure"; then \
				echo "❌ CRITICAL: Terraform refresh failed due to AWS credentials issue!"; \
				echo "   This likely means you are using different AWS credentials than when the resources were created."; \
				echo ""; \
				echo "   Current AWS Account: $$AWS_ACCOUNT"; \
				echo "   Resources may belong to a different AWS account."; \
				echo ""; \
				echo "💡 Required Actions:"; \
				echo "   1. Verify your current AWS credentials:"; \
				echo "      aws sts get-caller-identity"; \
				echo ""; \
				echo "   2. Configure the correct AWS credentials:"; \
				echo "      Option A: Run 'make ec2-setup' to reconfigure AWS credentials"; \
				echo "      Option B: Manually configure with 'aws configure'"; \
				echo "      Option C: Set environment variables:"; \
				echo "        export AWS_ACCESS_KEY_ID=your-access-key"; \
				echo "        export AWS_SECRET_ACCESS_KEY=your-secret-key"; \
				echo ""; \
				echo "   3. Verify the credentials match the account that created the resources"; \
				echo "   4. Run 'make ec2-destroy' again"; \
				echo ""; \
				echo "Refresh error details:"; \
				echo "$$REFRESH_OUTPUT" | head -10; \
				exit 1; \
			elif [ "$$HAS_RESOURCES" -gt 0 ]; then \
				echo "❌ CRITICAL: Terraform refresh failed and resources exist in state!"; \
				echo "   This likely indicates a credentials mismatch or access issue."; \
				echo ""; \
				echo "   Current AWS Account: $$AWS_ACCOUNT"; \
				echo "   Resources in state: $$HAS_RESOURCES"; \
				echo ""; \
				echo "💡 Required Actions:"; \
				echo "   1. Verify your current AWS credentials:"; \
				echo "      aws sts get-caller-identity"; \
				echo ""; \
				echo "   2. Configure the correct AWS credentials:"; \
				echo "      Option A: Run 'make ec2-setup' to reconfigure AWS credentials"; \
				echo "      Option B: Manually configure with 'aws configure'"; \
				echo "      Option C: Set environment variables:"; \
				echo "        export AWS_ACCESS_KEY_ID=your-access-key"; \
				echo "        export AWS_SECRET_ACCESS_KEY=your-secret-key"; \
				echo ""; \
				echo "   3. Verify the credentials match the account that created the resources"; \
				echo "   4. Run 'make ec2-destroy' again"; \
				echo ""; \
				echo "Refresh error details:"; \
				echo "$$REFRESH_OUTPUT" | head -10; \
				exit 1; \
			else \
				echo "⚠️  Warning: Terraform refresh failed (this may be normal if resources are already deleted):"; \
				echo "$$REFRESH_OUTPUT" | head -5; \
				echo "   Continuing with destroy operation..."; \
			fi; \
		fi; \
		echo "📋 Planning destruction..."; \
		DESTROY_PLAN=$$(terraform plan -destroy -no-color 2>&1); \
		DESTROY_PLAN_EXIT=$$?; \
		echo "$$DESTROY_PLAN"; \
		if [ $$DESTROY_PLAN_EXIT -ne 0 ]; then \
			echo "⚠️  Warning: Terraform plan failed. This may indicate resources are already deleted."; \
			echo "💡 Attempting to proceed with destroy anyway..."; \
		fi; \
		if echo "$$DESTROY_PLAN" | grep -q "No changes"; then \
			echo "⚠️  No resources to destroy. Infrastructure may already be destroyed."; \
		else \
			echo "💥 Destroying infrastructure..."; \
			DESTROY_OUTPUT=$$(terraform destroy -auto-approve 2>&1); \
			DESTROY_EXIT=$$?; \
			echo "$$DESTROY_OUTPUT"; \
			if [ $$DESTROY_EXIT -ne 0 ]; then \
				echo "❌ Failed to destroy infrastructure. Please check the error messages above."; \
				echo ""; \
				echo "💡 Recovery options:"; \
				echo "   1. Check if resources still exist in AWS manually"; \
				echo "   2. If this is a retry, some resources may have been partially deleted"; \
				echo "   3. To retry: Simply run 'make ec2-destroy' again"; \
				echo "   4. If state is corrupted: Remove ec2/terraform.tfstate and manually delete resources"; \
				exit 1; \
			fi; \
			if echo "$$DESTROY_OUTPUT" | grep -qE "Resources: [1-9][0-9]* destroyed"; then \
				echo "✅ EC2 infrastructure destroyed successfully!"; \
			elif echo "$$DESTROY_OUTPUT" | grep -q "Destroy complete"; then \
				if echo "$$DESTROY_OUTPUT" | grep -q "Resources: 0 destroyed"; then \
					echo "⚠️  Warning: Destroy completed but no resources were destroyed."; \
					echo "💡 This may indicate that resources were already deleted or state is out of sync."; \
					echo "🔍 Checking if resources still exist in AWS..."; \
					INSTANCE_ID=$$(terraform state show aws_instance.trh_platform_ec2 2>/dev/null | grep "id " | awk '{print $$3}' || echo ""); \
					if [ -n "$$INSTANCE_ID" ]; then \
						if aws ec2 describe-instances --instance-ids "$$INSTANCE_ID" >/dev/null 2>&1; then \
							echo "❌ Instance $$INSTANCE_ID still exists in AWS but was not destroyed!"; \
							echo "💡 Attempting to terminate instance directly..."; \
							aws ec2 terminate-instances --instance-ids "$$INSTANCE_ID" >/dev/null 2>&1 && \
							echo "✅ Instance termination initiated." || \
							echo "⚠️  Failed to terminate instance. Please terminate manually."; \
						else \
							echo "✅ Instance does not exist in AWS. Removing from state..."; \
							terraform state rm aws_instance.trh_platform_ec2 2>/dev/null || true; \
						fi; \
					fi; \
					SG_ID=$$(terraform state show aws_security_group.trh_platform_security_group 2>/dev/null | grep "id " | awk '{print $$3}' || echo ""); \
					if [ -n "$$SG_ID" ]; then \
						if aws ec2 describe-security-groups --group-ids "$$SG_ID" >/dev/null 2>&1; then \
							echo "❌ Security group $$SG_ID still exists in AWS but was not destroyed!"; \
							echo "💡 Attempting to delete security group directly..."; \
							aws ec2 delete-security-group --group-id "$$SG_ID" >/dev/null 2>&1 && \
							echo "✅ Security group deleted." || \
							echo "⚠️  Failed to delete security group. Please delete manually."; \
						else \
							echo "✅ Security group does not exist in AWS. Removing from state..."; \
							terraform state rm aws_security_group.trh_platform_security_group 2>/dev/null || true; \
						fi; \
					fi; \
					KEY_NAME=$$(terraform state show aws_key_pair.trh_platform_key 2>/dev/null | grep "key_name" | awk '{print $$3}' || echo ""); \
					if [ -n "$$KEY_NAME" ]; then \
						if aws ec2 describe-key-pairs --key-names "$$KEY_NAME" >/dev/null 2>&1; then \
							echo "❌ Key pair $$KEY_NAME still exists in AWS but was not destroyed!"; \
							echo "💡 Attempting to delete key pair directly..."; \
							aws ec2 delete-key-pair --key-name "$$KEY_NAME" >/dev/null 2>&1 && \
							echo "✅ Key pair deleted." || \
							echo "⚠️  Failed to delete key pair. Please delete manually."; \
						else \
							echo "✅ Key pair does not exist in AWS. Removing from state..."; \
							terraform state rm aws_key_pair.trh_platform_key 2>/dev/null || true; \
						fi; \
					fi; \
				else \
					echo "✅ EC2 infrastructure destroyed successfully!"; \
				fi; \
			else \
				echo "⚠️  Warning: Could not determine destroy status from output."; \
			fi; \
		fi; \
	else \
		echo "⚠️  No .env file found. Using default values."; \
		echo ""; \
		cd ec2 && \
		if [ ! -f terraform.tfstate ]; then \
			echo "⚠️  No Terraform state file found. Infrastructure may already be destroyed."; \
			exit 0; \
		fi && \
		echo "🔄 Refreshing Terraform state to ensure accuracy..."; \
		HAS_RESOURCES=$$(terraform state list 2>/dev/null | wc -l | tr -d ' '); \
		REFRESH_OUTPUT=$$(terraform refresh 2>&1); \
		REFRESH_EXIT=$$?; \
		if [ $$REFRESH_EXIT -ne 0 ]; then \
			if echo "$$REFRESH_OUTPUT" | grep -qE "UnauthorizedOperation|AccessDenied|InvalidInstanceID|InvalidUserID|AuthFailure"; then \
				echo "❌ CRITICAL: Terraform refresh failed due to AWS credentials issue!"; \
				echo "   This likely means you are using different AWS credentials than when the resources were created."; \
				echo ""; \
				echo "   Current AWS Account: $$AWS_ACCOUNT"; \
				echo "   Resources may belong to a different AWS account."; \
				echo ""; \
				echo "💡 Required Actions:"; \
				echo "   1. Verify your current AWS credentials:"; \
				echo "      aws sts get-caller-identity"; \
				echo ""; \
				echo "   2. Configure the correct AWS credentials:"; \
				echo "      Option A: Run 'make ec2-setup' to reconfigure AWS credentials"; \
				echo "      Option B: Manually configure with 'aws configure'"; \
				echo "      Option C: Set environment variables:"; \
				echo "        export AWS_ACCESS_KEY_ID=your-access-key"; \
				echo "        export AWS_SECRET_ACCESS_KEY=your-secret-key"; \
				echo ""; \
				echo "   3. Verify the credentials match the account that created the resources"; \
				echo "   4. Run 'make ec2-destroy' again"; \
				echo ""; \
				echo "Refresh error details:"; \
				echo "$$REFRESH_OUTPUT" | head -10; \
				exit 1; \
			elif [ "$$HAS_RESOURCES" -gt 0 ]; then \
				echo "❌ CRITICAL: Terraform refresh failed and resources exist in state!"; \
				echo "   This likely indicates a credentials mismatch or access issue."; \
				echo ""; \
				echo "   Current AWS Account: $$AWS_ACCOUNT"; \
				echo "   Resources in state: $$HAS_RESOURCES"; \
				echo ""; \
				echo "💡 Required Actions:"; \
				echo "   1. Verify your current AWS credentials:"; \
				echo "      aws sts get-caller-identity"; \
				echo ""; \
				echo "   2. Configure the correct AWS credentials:"; \
				echo "      Option A: Run 'make ec2-setup' to reconfigure AWS credentials"; \
				echo "      Option B: Manually configure with 'aws configure'"; \
				echo "      Option C: Set environment variables:"; \
				echo "        export AWS_ACCESS_KEY_ID=your-access-key"; \
				echo "        export AWS_SECRET_ACCESS_KEY=your-secret-key"; \
				echo ""; \
				echo "   3. Verify the credentials match the account that created the resources"; \
				echo "   4. Run 'make ec2-destroy' again"; \
				echo ""; \
				echo "Refresh error details:"; \
				echo "$$REFRESH_OUTPUT" | head -10; \
				exit 1; \
			else \
				echo "⚠️  Warning: Terraform refresh failed (this may be normal if resources are already deleted):"; \
				echo "$$REFRESH_OUTPUT" | head -5; \
				echo "   Continuing with destroy operation..."; \
			fi; \
		fi; \
		echo "📋 Planning destruction..."; \
		DESTROY_PLAN=$$(terraform plan -destroy -no-color 2>&1); \
		DESTROY_PLAN_EXIT=$$?; \
		echo "$$DESTROY_PLAN"; \
		if [ $$DESTROY_PLAN_EXIT -ne 0 ]; then \
			echo "⚠️  Warning: Terraform plan failed. This may indicate resources are already deleted."; \
			echo "💡 Attempting to proceed with destroy anyway..."; \
		fi; \
		if echo "$$DESTROY_PLAN" | grep -q "No changes"; then \
			echo "⚠️  No resources to destroy. Infrastructure may already be destroyed."; \
		else \
			echo "💥 Destroying infrastructure..."; \
			DESTROY_OUTPUT=$$(terraform destroy -auto-approve 2>&1); \
			DESTROY_EXIT=$$?; \
			echo "$$DESTROY_OUTPUT"; \
			if [ $$DESTROY_EXIT -ne 0 ]; then \
				echo "❌ Failed to destroy infrastructure. Please check the error messages above."; \
				echo ""; \
				echo "💡 Recovery options:"; \
				echo "   1. Check if resources still exist in AWS manually"; \
				echo "   2. If this is a retry, some resources may have been partially deleted"; \
				echo "   3. To retry: Simply run 'make ec2-destroy' again"; \
				echo "   4. If state is corrupted: Remove ec2/terraform.tfstate and manually delete resources"; \
				exit 1; \
			fi; \
			if echo "$$DESTROY_OUTPUT" | grep -qE "Resources: [1-9][0-9]* destroyed"; then \
				echo "✅ EC2 infrastructure destroyed successfully!"; \
			elif echo "$$DESTROY_OUTPUT" | grep -q "Destroy complete"; then \
				if echo "$$DESTROY_OUTPUT" | grep -q "Resources: 0 destroyed"; then \
					echo "⚠️  Warning: Destroy completed but no resources were destroyed."; \
					echo "💡 This may indicate that resources were already deleted or state is out of sync."; \
					echo "🔍 Checking if resources still exist in AWS..."; \
					INSTANCE_ID=$$(terraform state show aws_instance.trh_platform_ec2 2>/dev/null | grep "id " | awk '{print $$3}' || echo ""); \
					if [ -n "$$INSTANCE_ID" ]; then \
						if aws ec2 describe-instances --instance-ids "$$INSTANCE_ID" >/dev/null 2>&1; then \
							echo "❌ Instance $$INSTANCE_ID still exists in AWS but was not destroyed!"; \
							echo "💡 Attempting to terminate instance directly..."; \
							aws ec2 terminate-instances --instance-ids "$$INSTANCE_ID" >/dev/null 2>&1 && \
							echo "✅ Instance termination initiated." || \
							echo "⚠️  Failed to terminate instance. Please terminate manually."; \
						else \
							echo "✅ Instance does not exist in AWS. Removing from state..."; \
							terraform state rm aws_instance.trh_platform_ec2 2>/dev/null || true; \
						fi; \
					fi; \
					SG_ID=$$(terraform state show aws_security_group.trh_platform_security_group 2>/dev/null | grep "id " | awk '{print $$3}' || echo ""); \
					if [ -n "$$SG_ID" ]; then \
						if aws ec2 describe-security-groups --group-ids "$$SG_ID" >/dev/null 2>&1; then \
							echo "❌ Security group $$SG_ID still exists in AWS but was not destroyed!"; \
							echo "💡 Attempting to delete security group directly..."; \
							aws ec2 delete-security-group --group-id "$$SG_ID" >/dev/null 2>&1 && \
							echo "✅ Security group deleted." || \
							echo "⚠️  Failed to delete security group. Please delete manually."; \
						else \
							echo "✅ Security group does not exist in AWS. Removing from state..."; \
							terraform state rm aws_security_group.trh_platform_security_group 2>/dev/null || true; \
						fi; \
					fi; \
					KEY_NAME=$$(terraform state show aws_key_pair.trh_platform_key 2>/dev/null | grep "key_name" | awk '{print $$3}' || echo ""); \
					if [ -n "$$KEY_NAME" ]; then \
						if aws ec2 describe-key-pairs --key-names "$$KEY_NAME" >/dev/null 2>&1; then \
							echo "❌ Key pair $$KEY_NAME still exists in AWS but was not destroyed!"; \
							echo "💡 Attempting to delete key pair directly..."; \
							aws ec2 delete-key-pair --key-name "$$KEY_NAME" >/dev/null 2>&1 && \
							echo "✅ Key pair deleted." || \
							echo "⚠️  Failed to delete key pair. Please delete manually."; \
						else \
							echo "✅ Key pair does not exist in AWS. Removing from state..."; \
							terraform state rm aws_key_pair.trh_platform_key 2>/dev/null || true; \
						fi; \
					fi; \
				else \
					echo "✅ EC2 infrastructure destroyed successfully!"; \
				fi; \
			else \
				echo "⚠️  Warning: Could not determine destroy status from output."; \
			fi; \
		fi; \
	fi; \
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