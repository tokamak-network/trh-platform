#!/bin/bash

# TRH Platform EC2 Deployment Script
# This script will:
# 1. Create an EC2 instance with proper security groups
# 2. SSH into the instance
# 3. Set up the environment
# 4. Run make setup
# 5. Configure port 3000 for external access

set -e

# Configuration variables
KEY_NAME="trh-platform-key"
SECURITY_GROUP_NAME="trh-platform-sg"
INSTANCE_TYPE="t3.medium"
AMI_ID="ami-0c02fb55956c7d316"  # Amazon Linux 2 AMI (update as needed)
REGION="us-east-1"
USERNAME="ec2-user"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if AWS CLI is installed and configured
check_aws_cli() {
    print_status "Checking AWS CLI installation..."
    
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS CLI is not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    print_success "AWS CLI is installed and configured"
}

# Function to create key pair
create_key_pair() {
    print_status "Creating key pair: $KEY_NAME"
    
    if aws ec2 describe-key-pairs --key-names "$KEY_NAME" --region "$REGION" &> /dev/null; then
        print_warning "Key pair $KEY_NAME already exists"
    else
        aws ec2 create-key-pair --key-name "$KEY_NAME" --region "$REGION" --query 'KeyMaterial' --output text > "${KEY_NAME}.pem"
        chmod 400 "${KEY_NAME}.pem"
        print_success "Key pair created: ${KEY_NAME}.pem"
    fi
}

# Function to create security group
create_security_group() {
    print_status "Creating security group: $SECURITY_GROUP_NAME"
    
    # Check if security group already exists
    SG_ID=$(aws ec2 describe-security-groups --group-names "$SECURITY_GROUP_NAME" --region "$REGION" --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")
    
    if [ "$SG_ID" != "None" ] && [ "$SG_ID" != "null" ]; then
        print_warning "Security group $SECURITY_GROUP_NAME already exists with ID: $SG_ID"
    else
        # Get VPC ID
        VPC_ID=$(aws ec2 describe-vpcs --region "$REGION" --query 'Vpcs[0].VpcId' --output text)
        
        # Create security group
        SG_ID=$(aws ec2 create-security-group \
            --group-name "$SECURITY_GROUP_NAME" \
            --description "Security group for TRH Platform" \
            --vpc-id "$VPC_ID" \
            --region "$REGION" \
            --query 'GroupId' \
            --output text)
        
        print_success "Security group created with ID: $SG_ID"
    fi
    
    # Add inbound rules
    print_status "Adding inbound rules to security group..."
    
    # SSH access (port 22)
    aws ec2 authorize-security-group-ingress \
        --group-id "$SG_ID" \
        --protocol tcp \
        --port 22 \
        --cidr 0.0.0.0/0 \
        --region "$REGION" &> /dev/null || print_warning "SSH rule may already exist"
    
    # HTTP access (port 80)
    aws ec2 authorize-security-group-ingress \
        --group-id "$SG_ID" \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 \
        --region "$REGION" &> /dev/null || print_warning "HTTP rule may already exist"
    
    # HTTPS access (port 443)
    aws ec2 authorize-security-group-ingress \
        --group-id "$SG_ID" \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0 \
        --region "$REGION" &> /dev/null || print_warning "HTTPS rule may already exist"
    
    # TRH Platform access (port 3000)
    aws ec2 authorize-security-group-ingress \
        --group-id "$SG_ID" \
        --protocol tcp \
        --port 3000 \
        --cidr 0.0.0.0/0 \
        --region "$REGION" &> /dev/null || print_warning "Port 3000 rule may already exist"
    
    # Backend API access (port 8000)
    aws ec2 authorize-security-group-ingress \
        --group-id "$SG_ID" \
        --protocol tcp \
        --port 8000 \
        --cidr 0.0.0.0/0 \
        --region "$REGION" &> /dev/null || print_warning "Port 8000 rule may already exist"
    
    print_success "Security group rules configured"
}

# Function to create EC2 instance
create_ec2_instance() {
    print_status "Creating EC2 instance..."
    
    # Create user data script for initial setup
    cat > user_data.sh << 'EOF'
#!/bin/bash
yum update -y
yum install -y docker git
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose

# Install make
yum install -y make

# Create project directory
mkdir -p /home/ec2-user/trh-platform
chown ec2-user:ec2-user /home/ec2-user/trh-platform
EOF

    # Launch EC2 instance
    INSTANCE_ID=$(aws ec2 run-instances \
        --image-id "$AMI_ID" \
        --count 1 \
        --instance-type "$INSTANCE_TYPE" \
        --key-name "$KEY_NAME" \
        --security-group-ids "$SG_ID" \
        --user-data file://user_data.sh \
        --region "$REGION" \
        --query 'Instances[0].InstanceId' \
        --output text)
    
    print_success "EC2 instance created with ID: $INSTANCE_ID"
    
    # Wait for instance to be running
    print_status "Waiting for instance to be running..."
    aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"
    
    # Get public IP
    PUBLIC_IP=$(aws ec2 describe-instances \
        --instance-ids "$INSTANCE_ID" \
        --region "$REGION" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text)
    
    print_success "Instance is running with public IP: $PUBLIC_IP"
    
    # Clean up user data file
    rm -f user_data.sh
    
    echo "$INSTANCE_ID" > instance_id.txt
    echo "$PUBLIC_IP" > public_ip.txt
}

# Function to wait for SSH to be available
wait_for_ssh() {
    local ip=$1
    print_status "Waiting for SSH to be available on $ip..."
    
    for i in {1..30}; do
        if ssh -i "${KEY_NAME}.pem" -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$USERNAME@$ip" "echo 'SSH is ready'" &> /dev/null; then
            print_success "SSH is ready"
            return 0
        fi
        print_status "Attempt $i/30: SSH not ready yet, waiting 10 seconds..."
        sleep 10
    done
    
    print_error "SSH connection failed after 30 attempts"
    exit 1
}

# Function to deploy the application
deploy_application() {
    local ip=$1
    print_status "Deploying TRH Platform to EC2 instance..."
    
    # Create a deployment script to run on the EC2 instance
    cat > deploy_on_ec2.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 Starting TRH Platform deployment on EC2..."

# Navigate to project directory
cd /home/ec2-user/trh-platform

# Clone the repository (you may need to adjust this based on your setup)
# For now, we'll create the necessary files from the current directory
echo "📁 Setting up project structure..."

# Create config directory
mkdir -p config

# Create environment files
cat > config/.env.backend << 'ENVEOF'
# backend env
PORT = 8000
POSTGRES_USER = postgres
POSTGRES_PASSWORD = postgres
POSTGRES_DB = trh_db
POSTGRES_HOST = postgres
POSTGRES_PORT = 5432
# JWT Configuration
JWT_SECRET=your-secret-key

# Default Admin Account (optional - will use defaults if not set)
DEFAULT_ADMIN_EMAIL=admin@gmail.com
DEFAULT_ADMIN_PASSWORD=admin
ENVEOF

cat > config/.env.frontend << 'ENVEOF'
## frontend env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENVEOF

# Create docker-compose.yml
cat > docker-compose.yml << 'COMPOSEEOF'
version: "3.8"

services:
  postgres:
    image: postgres:15
    env_file:
      - ./config/.env.backend
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    image: tokamaknetwork/trh-backend
    ports:
      - "8000:8000"
    env_file:
      - ./config/.env.backend
    depends_on:
      - postgres
    restart: unless-stopped
    volumes:
      - backend_storage:/app/storage

  ui:
    image: tokamaknetwork/trh-platform-ui
    ports:
      - "3000:3000"
    env_file:
      - ./config/.env.frontend
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  postgres_data:
  backend_storage:
COMPOSEEOF

# Create Makefile
cat > Makefile << 'MAKEEOF'
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
MAKEEOF

# Create setup.sh
cat > setup.sh << 'SETUPEOF'
#!/bin/bash

# Script to setup TRH backend container
# This script will:
# 1. Get the running trh-backend container
# 2. Execute into the container
# 3. Run the install-all-packages.sh script
# 4. Source bashrc
# 5. Exit

set -e

# Retry configuration
MAX_RETRIES=5
RETRY_DELAY=3

echo "🔍 Finding running trh-backend container..."

# Sleep for 10 seconds to ensure the container is running
sleep 10

# Function to find the running trh-backend container
find_container() {
    docker ps --filter "ancestor=tokamaknetwork/trh-backend" --format "table {{.ID}}" | tail -n +2 | head -n 1
}

# Retry mechanism to find the container
CONTAINER_ID=""
for attempt in $(seq 1 $MAX_RETRIES); do
    echo "Attempt $attempt/$MAX_RETRIES to find container..."
    
    CONTAINER_ID=$(find_container)
    
    if [ -n "$CONTAINER_ID" ]; then
        echo "✅ Found container: $CONTAINER_ID"
        break
    fi
    
    if [ $attempt -lt $MAX_RETRIES ]; then
        echo "❌ No running trh-backend container found. Retrying in ${RETRY_DELAY} seconds..."
        sleep $RETRY_DELAY
    else
        echo "❌ No running trh-backend container found after $MAX_RETRIES attempts!"
        echo "Please make sure the container is running with:"
        echo "  docker compose up -d"
        exit 1
    fi
done

echo "🚀 Executing into container and running setup..."

# Execute into the container and run the commands
docker exec -it "$CONTAINER_ID" bash -c "
echo '📦 Running install-all-packages.sh...'

# Install TRH SDK packages (equivalent to what setup.sh does at the end)
wget https://raw.githubusercontent.com/tokamak-network/trh-backend/refs/heads/main/docker_install_dependencies_script.sh
chmod +x docker_install_dependencies_script.sh
DEBIAN_FRONTEND=noninteractive TZ=UTC ./docker_install_dependencies_script.sh

# Ensure necessary binaries are available in the PATH
ln -sf /root/.local/share/pnpm/pnpm /usr/local/bin/pnpm
ln -sf /root/.nvm/versions/node/v20.16.0/bin/npx /usr/local/bin/npx
ln -sf /root/.foundry/bin/forge /usr/local/bin/forge
ln -sf /root/.foundry/bin/cast /usr/local/bin/cast
ln -sf /root/.foundry/bin/anvil /usr/local/bin/anvil
ln -sf /root/.nvm/versions/node/v20.16.0/bin/node /usr/local/bin/node
ln -sf /root/.nvm/versions/node/v20.16.0/bin/npm /usr/local/bin/npm


echo '🔄 Sourcing bashrc...'
source ~/.bashrc

echo '✅ Setup completed successfully!'
echo 'Exiting container...'
"

echo "🎉 Container setup completed!"
SETUPEOF

chmod +x setup.sh

echo "📦 Running make setup..."
make setup

echo "🎉 TRH Platform deployment completed!"
echo "🌐 Your application should be accessible at:"
echo "   Frontend: http://$PUBLIC_IP:3000"
echo "   Backend API: http://$PUBLIC_IP:8000"
EOF

    # Copy and execute the deployment script on EC2
    scp -i "${KEY_NAME}.pem" -o StrictHostKeyChecking=no deploy_on_ec2.sh "$USERNAME@$ip:/home/ec2-user/"
    ssh -i "${KEY_NAME}.pem" -o StrictHostKeyChecking=no "$USERNAME@$ip" "chmod +x /home/ec2-user/deploy_on_ec2.sh && /home/ec2-user/deploy_on_ec2.sh"
    
    # Clean up local deployment script
    rm -f deploy_on_ec2.sh
    
    print_success "Application deployed successfully!"
}

# Function to display final information
display_final_info() {
    local ip=$1
    local instance_id=$2
    
    echo ""
    echo "🎉 TRH Platform deployment completed successfully!"
    echo ""
    echo "📋 Instance Information:"
    echo "   Instance ID: $instance_id"
    echo "   Public IP: $ip"
    echo "   Key Pair: ${KEY_NAME}.pem"
    echo ""
    echo "🌐 Application URLs:"
    echo "   Frontend: http://$ip:3000"
    echo "   Backend API: http://$ip:8000"
    echo ""
    echo "🔧 Management Commands:"
    echo "   SSH into instance: ssh -i ${KEY_NAME}.pem $USERNAME@$ip"
    echo "   View logs: ssh -i ${KEY_NAME}.pem $USERNAME@$ip 'cd /home/ec2-user/trh-platform && make logs'"
    echo "   Check status: ssh -i ${KEY_NAME}.pem $USERNAME@$ip 'cd /home/ec2-user/trh-platform && make status'"
    echo "   Stop services: ssh -i ${KEY_NAME}.pem $USERNAME@$ip 'cd /home/ec2-user/trh-platform && make down'"
    echo "   Start services: ssh -i ${KEY_NAME}.pem $USERNAME@$ip 'cd /home/ec2-user/trh-platform && make up'"
    echo ""
    echo "⚠️  Important Notes:"
    echo "   - Keep your ${KEY_NAME}.pem file secure"
    echo "   - The instance will continue running and incur charges"
    echo "   - To stop the instance: aws ec2 terminate-instances --instance-ids $instance_id --region $REGION"
    echo "   - To delete the security group: aws ec2 delete-security-group --group-id $SG_ID --region $REGION"
    echo ""
}

# Function to destroy all resources
destroy_resources() {
    echo "🗑️  TRH Platform Resource Destruction"
    echo "====================================="
    echo ""
    
    # Check prerequisites
    check_aws_cli
    
    print_status "Looking for existing resources to destroy..."
    
    # Get instance ID from file if it exists
    if [ -f "instance_id.txt" ]; then
        INSTANCE_ID=$(cat instance_id.txt)
        print_status "Found instance ID: $INSTANCE_ID"
    else
        print_warning "No instance_id.txt found. Searching for instances with key pair: $KEY_NAME"
        INSTANCE_ID=$(aws ec2 describe-instances \
            --filters "Name=key-name,Values=$KEY_NAME" "Name=instance-state-name,Values=running,pending,stopping,stopped" \
            --region "$REGION" \
            --query 'Reservations[].Instances[].InstanceId' \
            --output text | head -n 1)
    fi
    
    # Get security group ID
    SG_ID=$(aws ec2 describe-security-groups --group-names "$SECURITY_GROUP_NAME" --region "$REGION" --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")
    
    # Terminate EC2 instance
    if [ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "None" ] && [ "$INSTANCE_ID" != "null" ]; then
        print_status "Terminating EC2 instance: $INSTANCE_ID"
        aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" --region "$REGION" > /dev/null
        
        print_status "Waiting for instance to terminate..."
        aws ec2 wait instance-terminated --instance-ids "$INSTANCE_ID" --region "$REGION"
        print_success "EC2 instance terminated successfully"
    else
        print_warning "No running EC2 instance found with key pair: $KEY_NAME"
    fi
    
    # Delete security group
    if [ "$SG_ID" != "None" ] && [ "$SG_ID" != "null" ]; then
        print_status "Deleting security group: $SG_ID"
        aws ec2 delete-security-group --group-id "$SG_ID" --region "$REGION" 2>/dev/null || print_warning "Security group may already be deleted or in use"
        print_success "Security group deleted successfully"
    else
        print_warning "No security group found with name: $SECURITY_GROUP_NAME"
    fi
    
    # Delete key pair
    if aws ec2 describe-key-pairs --key-names "$KEY_NAME" --region "$REGION" &> /dev/null; then
        print_status "Deleting key pair: $KEY_NAME"
        aws ec2 delete-key-pair --key-name "$KEY_NAME" --region "$REGION"
        print_success "Key pair deleted successfully"
        
        # Remove local key file
        if [ -f "${KEY_NAME}.pem" ]; then
            rm -f "${KEY_NAME}.pem"
            print_success "Local key file removed: ${KEY_NAME}.pem"
        fi
    else
        print_warning "No key pair found with name: $KEY_NAME"
    fi
    
    # Clean up temporary files
    rm -f instance_id.txt public_ip.txt
    
    echo ""
    print_success "🎉 All TRH Platform resources have been destroyed!"
    echo ""
    echo "📋 Resources destroyed:"
    echo "   ✅ EC2 Instance: $INSTANCE_ID"
    echo "   ✅ Security Group: $SG_ID"
    echo "   ✅ Key Pair: $KEY_NAME"
    echo "   ✅ Local key file: ${KEY_NAME}.pem"
    echo ""
}

# Function to show help
show_help() {
    echo "🚀 TRH Platform EC2 Deployment Script"
    echo "======================================"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  deploy    Deploy TRH Platform to EC2 (default)"
    echo "  destroy   Destroy all AWS resources"
    echo "  help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                # Deploy the platform"
    echo "  $0 deploy         # Deploy the platform"
    echo "  $0 destroy        # Destroy all resources"
    echo "  $0 help           # Show help"
    echo ""
    echo "Prerequisites:"
    echo "  - AWS CLI installed and configured"
    echo "  - Proper AWS permissions for EC2 operations"
    echo ""
}

# Main execution
main() {
    echo "🚀 TRH Platform EC2 Deployment Script"
    echo "======================================"
    echo ""
    
    # Check prerequisites
    check_aws_cli
    
    # Create AWS resources
    create_key_pair
    create_security_group
    create_ec2_instance
    
    # Get instance information
    INSTANCE_ID=$(cat instance_id.txt)
    PUBLIC_IP=$(cat public_ip.txt)
    
    # Deploy application
    wait_for_ssh "$PUBLIC_IP"
    deploy_application "$PUBLIC_IP"
    
    # Display final information
    display_final_info "$PUBLIC_IP" "$INSTANCE_ID"
    
    # Clean up temporary files
    rm -f instance_id.txt public_ip.txt
}

# Parse command line arguments
case "${1:-deploy}" in
    "deploy")
        main "$@"
        ;;
    "destroy")
        destroy_resources
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
