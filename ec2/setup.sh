#!/usr/bin/env bash

# TRH Platform Setup Script
# This script generates SSH keys, copies environment template, and configures AWS
# Usage: ./setup.sh [AWS_ACCESS_KEY_ID] [AWS_SECRET_ACCESS_KEY] [AWS_REGION]

set -e  # Exit on any error

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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if AWS key pair exists
check_aws_key_pair_exists() {
    local key_name="$1"
    if aws ec2 describe-key-pairs --key-names "$key_name" >/dev/null 2>&1; then
        return 0  # Key pair exists
    else
        return 1  # Key pair does not exist
    fi
}

# Function to prompt for a new key pair name if it already exists
get_valid_key_pair_name() {
    local suggested_name="$1"
    local key_name="$suggested_name"
    
    while check_aws_key_pair_exists "$key_name"; do
        print_warning "AWS key pair '$key_name' already exists in your AWS account."
        echo -n "Please enter a different key pair name: "
        read -r key_name
        if [[ -z "$key_name" ]]; then
            print_error "Key pair name cannot be empty."
            key_name="$suggested_name"
        fi
    done
    
    echo "$key_name"
}

# Parse command line arguments
AWS_ACCESS_KEY_ID_PARAM="$1"
AWS_SECRET_ACCESS_KEY_PARAM="$2"
AWS_REGION_PARAM="${3:-ap-northeast-2}"
KEY_PAIR_NAME_PARAM="${4:-trh-platform-key}"

# Check if AWS credentials are provided as parameters
if [[ -n "$AWS_ACCESS_KEY_ID_PARAM" && -n "$AWS_SECRET_ACCESS_KEY_PARAM" ]]; then
    USE_PARAMS=true
    print_status "Using AWS credentials provided as parameters"
else
    USE_PARAMS=false
    print_status "No AWS credentials provided as parameters, will use .env file method"
fi

# Check prerequisites
print_status "Checking prerequisites..."

if ! command_exists aws; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

if ! command_exists ssh-keygen; then
    print_error "ssh-keygen is not available. Please install OpenSSH."
    exit 1
fi

print_success "Prerequisites check passed"

# Step 1: Generate SSH Key
print_status "Step 1: Generating SSH key pair..."

SSH_KEY_NAME="$KEY_PAIR_NAME_PARAM"
SSH_KEY_PATH="$HOME/.ssh/$SSH_KEY_NAME"
SSH_PUB_KEY_PATH="$HOME/.ssh/$SSH_KEY_NAME.pub"

# Create .ssh directory if it doesn't exist
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

# Check if key already exists
if [[ -f "$SSH_KEY_PATH" ]]; then
    print_warning "SSH key $SSH_KEY_PATH already exists."
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Skipping SSH key generation"
    else
        print_status "Generating new SSH key pair..."
        ssh-keygen -t rsa -b 4096 -f "$SSH_KEY_PATH" -N "" -C "trh-platform-$(date +%Y%m%d)"
        chmod 600 "$SSH_KEY_PATH"
        chmod 644 "$SSH_PUB_KEY_PATH"
        print_success "SSH key pair generated successfully"
    fi
else
    print_status "Generating SSH key pair..."
    ssh-keygen -t rsa -b 4096 -f "$SSH_KEY_PATH" -N "" -C "trh-platform-$(date +%Y%m%d)"
    chmod 600 "$SSH_KEY_PATH"
    chmod 644 "$SSH_PUB_KEY_PATH"
    print_success "SSH key pair generated at $SSH_KEY_PATH"
fi

# Step 2: Copy terraform.env.template to .env
print_status "Step 2: Setting up environment configuration..."

TEMPLATE_FILE="terraform.env.template"
ENV_FILE=".env"

if [[ ! -f "$TEMPLATE_FILE" ]]; then
    print_error "Template file $TEMPLATE_FILE not found in current directory"
    exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
    print_warning "Environment file $ENV_FILE already exists."
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Skipping environment file creation"
    else
        cp "$TEMPLATE_FILE" "$ENV_FILE"
        # Add KEY_PAIR_NAME to .env file
        echo "" >> "$ENV_FILE"
        echo "KEY_PAIR_NAME=$SSH_KEY_NAME" >> "$ENV_FILE"
        print_success "Environment file created from template"
    fi
else
    cp "$TEMPLATE_FILE" "$ENV_FILE"
    # Add KEY_PAIR_NAME to .env file
    echo "" >> "$ENV_FILE"
    echo "KEY_PAIR_NAME=$SSH_KEY_NAME" >> "$ENV_FILE"
    print_success "Environment file $ENV_FILE created from template"
fi

# Step 3: Configure AWS CLI
print_status "Step 3: Configuring AWS CLI..."

if [[ "$USE_PARAMS" == true ]]; then
    # Use parameters provided from command line
    print_status "Configuring AWS CLI with provided credentials..."
    
    # Update .env file with provided credentials
    if [[ -f "$ENV_FILE" ]]; then
        sed -i '' "s/^AWS_ACCESS_KEY_ID=.*/AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID_PARAM/" "$ENV_FILE"
        sed -i '' "s/^AWS_SECRET_ACCESS_KEY=.*/AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY_PARAM/" "$ENV_FILE"
        sed -i '' "s/^AWS_REGION=.*/AWS_REGION=$AWS_REGION_PARAM/" "$ENV_FILE"
        # Add or update KEY_PAIR_NAME in .env file
        if grep -q "^KEY_PAIR_NAME=" "$ENV_FILE"; then
            sed -i '' "s/^KEY_PAIR_NAME=.*/KEY_PAIR_NAME=$SSH_KEY_NAME/" "$ENV_FILE"
        else
            echo "" >> "$ENV_FILE"
            echo "KEY_PAIR_NAME=$SSH_KEY_NAME" >> "$ENV_FILE"
        fi
        print_success "Updated $ENV_FILE with provided credentials and key pair name"
    fi
    
    # Configure AWS CLI directly
    aws configure set aws_access_key_id "$AWS_ACCESS_KEY_ID_PARAM"
    aws configure set aws_secret_access_key "$AWS_SECRET_ACCESS_KEY_PARAM"
    aws configure set default.region "$AWS_REGION_PARAM"
    aws configure set default.output "json"
    
    # Set variables for testing
    AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID_PARAM"
    AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY_PARAM"
    AWS_REGION="$AWS_REGION_PARAM"
    
else
    # Use .env file method (fallback for manual usage)
    if [[ -f "$ENV_FILE" ]]; then
        source "$ENV_FILE"
    else
        print_error "Environment file $ENV_FILE not found"
        exit 1
    fi

    # Check if AWS credentials are set in .env
    if [[ "$AWS_ACCESS_KEY_ID" == "your-aws-access-key-id" ]] || [[ -z "$AWS_ACCESS_KEY_ID" ]]; then
        print_warning "AWS credentials not configured in $ENV_FILE"
        print_status "Please edit $ENV_FILE and add your AWS credentials:"
        print_status "  - AWS_ACCESS_KEY_ID=your-actual-access-key"
        print_status "  - AWS_SECRET_ACCESS_KEY=your-actual-secret-key"
        print_status "Then run this script again or configure AWS manually with 'aws configure'"
        exit 1
    fi

    # Configure AWS CLI with credentials from .env
    print_status "Configuring AWS CLI with credentials from $ENV_FILE..."
    aws configure set aws_access_key_id "$AWS_ACCESS_KEY_ID"
    aws configure set aws_secret_access_key "$AWS_SECRET_ACCESS_KEY"
    aws configure set default.region "$AWS_REGION"
    aws configure set default.output "json"
fi

# Test AWS configuration
print_status "Testing AWS configuration..."
if aws sts get-caller-identity >/dev/null 2>&1; then
    print_success "AWS CLI configured successfully"
    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    AWS_USER=$(aws sts get-caller-identity --query Arn --output text)
    print_status "Connected as: $AWS_USER"
    print_status "Account ID: $AWS_ACCOUNT"
else
    print_error "AWS configuration test failed. Please check your credentials."
    exit 1
fi

# Step 4: Validate AWS key pair name and update if needed
print_status "Step 4: Validating AWS key pair name..."
VALIDATED_KEY_NAME=$(get_valid_key_pair_name "$KEY_PAIR_NAME_PARAM")

if [[ "$VALIDATED_KEY_NAME" != "$KEY_PAIR_NAME_PARAM" ]]; then
    print_status "Using validated key pair name: $VALIDATED_KEY_NAME"
    OLD_SSH_KEY_NAME="$SSH_KEY_NAME"
    SSH_KEY_NAME="$VALIDATED_KEY_NAME"
    SSH_KEY_PATH="$HOME/.ssh/$SSH_KEY_NAME"
    SSH_PUB_KEY_PATH="$HOME/.ssh/$SSH_KEY_NAME.pub"
    
    # If we generated a key with the old name, rename it to the new name
    if [[ -f "$HOME/.ssh/$OLD_SSH_KEY_NAME" && "$OLD_SSH_KEY_NAME" != "$SSH_KEY_NAME" ]]; then
        print_status "Renaming SSH key from $OLD_SSH_KEY_NAME to $SSH_KEY_NAME"
        mv "$HOME/.ssh/$OLD_SSH_KEY_NAME" "$SSH_KEY_PATH"
        mv "$HOME/.ssh/$OLD_SSH_KEY_NAME.pub" "$SSH_PUB_KEY_PATH"
    fi
    
    # Generate new SSH key with the validated name if it doesn't exist
    if [[ ! -f "$SSH_KEY_PATH" ]]; then
        print_status "Generating SSH key pair with validated name: $VALIDATED_KEY_NAME"
        ssh-keygen -t rsa -b 4096 -f "$SSH_KEY_PATH" -N "" -C "trh-platform-$(date +%Y%m%d)"
        chmod 600 "$SSH_KEY_PATH"
        chmod 644 "$SSH_PUB_KEY_PATH"
        print_success "SSH key pair generated at $SSH_KEY_PATH"
    fi
    
    # Update .env file with the validated key pair name
    if [[ -f "$ENV_FILE" ]]; then
        if grep -q "^KEY_PAIR_NAME=" "$ENV_FILE"; then
            sed -i '' "s/^KEY_PAIR_NAME=.*/KEY_PAIR_NAME=$VALIDATED_KEY_NAME/" "$ENV_FILE"
        else
            echo "" >> "$ENV_FILE"
            echo "KEY_PAIR_NAME=$VALIDATED_KEY_NAME" >> "$ENV_FILE"
        fi
        print_success "Updated $ENV_FILE with validated key pair name: $VALIDATED_KEY_NAME"
    fi
else
    print_success "Key pair name '$KEY_PAIR_NAME_PARAM' is available in AWS"
fi

# Summary
echo
print_success "Setup completed successfully!"
echo
print_status "Summary:"
print_status "  ✓ SSH key pair generated: $SSH_KEY_PATH (name: $SSH_KEY_NAME)"
print_status "  ✓ Public key available: $SSH_PUB_KEY_PATH"
print_status "  ✓ Environment file created: $ENV_FILE"
print_status "  ✓ AWS CLI configured for region: $AWS_REGION"
print_status "  ✓ Key pair name stored: $SSH_KEY_NAME"
echo
print_status "Next steps:"
print_status "  1. Review and update $ENV_FILE if needed"
print_status "  2. Run 'terraform init' to initialize Terraform"
print_status "  3. Run 'terraform plan' to review the infrastructure plan"
print_status "  4. Run 'terraform apply' to create the infrastructure"
echo
print_status "Your public key content (for manual key pair creation if needed):"
echo "----------------------------------------"
cat "$SSH_PUB_KEY_PATH"
echo "----------------------------------------"
