#!/usr/bin/env bash

# Simplified installation script for git, make, and docker only
# Get machine architecture
ARCH=$(uname -m)

if [[ "$ARCH" == "x86_64" ]] || [[ "$ARCH" == "amd64" ]]; then
    ARCH="amd64"
elif [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
    ARCH="arm64"
elif [[ "$ARCH" == "armv6l" ]]; then
    ARCH="armv6l"
elif [[ "$ARCH" == "i386" ]]; then
    ARCH="386"
else
    echo "$ARCH is an unsupported architecture."
    exit 1
fi

OS_TYPE=$(uname)

TOTAL_MACOS_STEPS=3
TOTAL_LINUX_STEPS=3
STEP=1
SUCCESS="false"

# Detect current shell
CURRENT_SHELL=$(ps -p $$ -o comm=)

if [ "$OS_TYPE" = "Darwin" ] && [ -z "$SKIP_SHEBANG_CHECK" ]; then
    if [ "$CURRENT_SHELL" != "zsh" ]; then
        if [ -x "/bin/zsh" ]; then
            export SKIP_SHEBANG_CHECK=1
            echo "macOS detected. Current shell: $CURRENT_SHELL. Switching to zsh interpreter......"
            exec /bin/zsh "$0" "$@"
        else
            echo "Error: /bin/zsh not found. Please ensure zsh is installed." >&2
            exit 1
        fi
    fi
fi

# Check Shell
SHELL_NAME=$(basename "$SHELL")
if [[ "$SHELL_NAME" == "zsh" ]]; then
    echo "The current shell is $SHELL_NAME. The installation will proceed based on $SHELL_NAME."
elif [[ "$SHELL_NAME" == "bash" ]]; then
    echo "The current shell is $SHELL_NAME. The installation will proceed based on $SHELL_NAME."
else
    echo "The current shell is $SHELL_NAME. $SHELL_NAME is an unsupported shell."
    exit 1
fi

# Set Config File
if [ "$SHELL_NAME" = "zsh" ]; then
    CONFIG_FILE="$HOME/.zshrc"
    PROFILE_FILE="$HOME/.zshrc"
elif [ "$SHELL_NAME" = "bash" ]; then
    CONFIG_FILE="$HOME/.bashrc"
    PROFILE_FILE="$HOME/.profile"
fi

# Function to display completion message
function display_completion_message {
    if [[ "$SUCCESS" == "true" ]]; then
        echo ""
        echo "All steps are complete."
        echo ""
        exit 0
    else
        echo ""
        echo "Installation was interrupted. Completed $((STEP - 1)) steps."
        echo ""
        echo "Please source your profile to apply changes:"
        echo -e "\033[1;32msource $CONFIG_FILE\033[0m"
        exit 1
    fi
}

# Use trap to display message on script exit, whether successful or due to an error
trap display_completion_message EXIT
trap "echo 'Process interrupted!'; exit 1" INT

if [[ "$OS_TYPE" == "Darwin" ]]; then
    # 1. Install Git
    echo "[$STEP/$TOTAL_MACOS_STEPS] Installing Git..."
    if ! command -v git &> /dev/null; then
        echo "git not found, installing..."
        # Install Homebrew first if not available
        if ! command -v brew &> /dev/null; then
            echo "Homebrew not found, installing..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            export PATH="/opt/homebrew/bin:$PATH"
        fi
        brew install git
    else
        echo "git is already installed."
    fi
    STEP=$((STEP + 1))
    echo

    # 2. Install Make (part of Xcode Command Line Tools)
    echo "[$STEP/$TOTAL_MACOS_STEPS] Installing Make (Xcode Command Line Tools)..."
    if ! command -v make &> /dev/null; then
        echo "make not found, installing Xcode Command Line Tools..."
        xcode-select --install
    else
        echo "make is already installed."
    fi
    STEP=$((STEP + 1))
    echo

    # 3. Install Docker
    echo "[$STEP/$TOTAL_MACOS_STEPS] Installing Docker..."
    if ! command -v docker &> /dev/null; then
        echo "Docker not found, installing..."
        if ! command -v brew &> /dev/null; then
            echo "Homebrew not found, installing..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            export PATH="/opt/homebrew/bin:$PATH"
        fi
        brew install --cask docker
    else
        echo "Docker is already installed."
    fi

    # Start Docker Daemon
    echo "Starting Docker Daemon..."
    if ! docker ps > /dev/null 2>&1; then
        echo "🚫 Docker is not running. Starting Docker Desktop..."
        open -a Docker

        # Wait for Docker to initialize
        while ! docker ps > /dev/null 2>&1; do
            echo "⏳ Waiting for Docker to start..."
            sleep 2
        done

        echo "✅ Docker is now running!"
    else
        echo "✅ Docker is already running."
    fi
    STEP=$((STEP + 1))
    echo

    SUCCESS="true"

elif [[ "$OS_TYPE" == "Linux" ]]; then
    # Update package lists and upgrade existing packages
    echo "Updating package lists and upgrading existing packages..."
    sudo apt-get update -y
    sudo apt-get upgrade -y
    echo

    if ! command -v sudo &> /dev/null; then
        echo "sudo not found, installing..."
        apt-get install -y sudo
    fi

    # 1. Install Git
    echo "[$STEP/$TOTAL_LINUX_STEPS] Installing Git..."
    if ! command -v git &> /dev/null; then
        echo "git not found, installing..."
        sudo apt-get install -y git
    else
        echo "git is already installed."
    fi
    STEP=$((STEP + 1))
    echo

    # 2. Install Make (part of build-essential)
    echo "[$STEP/$TOTAL_LINUX_STEPS] Installing Make (build-essential)..."
    if ! command -v make &> /dev/null; then
        echo "make not found, installing build-essential..."
        sudo apt-get install -y build-essential
    else
        echo "make is already installed."
    fi
    STEP=$((STEP + 1))
    echo

    # 3. Install Docker
    echo "[$STEP/$TOTAL_LINUX_STEPS] Installing Docker..."
    if ! command -v docker &> /dev/null; then
        echo "Installing Docker..."
        sudo apt-get install -y ca-certificates curl gnupg
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        sudo chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        sudo apt-get update -y
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    else
        echo "Docker is already installed."
    fi

    # Start Docker Daemon
    echo "Starting Docker Daemon..."
    if ! docker ps > /dev/null 2>&1; then
        echo "Docker is not running. Starting Docker service..."
        sudo systemctl start docker
        sudo systemctl enable docker
        sudo usermod -aG docker $USER
        
        # Wait for Docker to initialize
        while ! docker ps > /dev/null 2>&1; do
            echo "⏳ Waiting for Docker to start..."
            sleep 2
        done
        
        echo "✅ Docker is now running!"
        echo "Note: You may need to log out and back in for Docker group permissions to take effect."
    else
        echo "✅ Docker is already running."
    fi
    STEP=$((STEP + 1))
    echo

    SUCCESS="true"
else
    echo "Unsupported OS: $OS_TYPE"
    exit 1
fi

# Function to check if a command exists and display its version
function check_command_version {
    CMD=$1
    VERSION_CMD=$2

    if command -v "$CMD" &> /dev/null; then
        CURRENT_VERSION=$(eval $VERSION_CMD 2>&1 | head -n 1)
        echo "✅ $CMD is installed. Current version: $CURRENT_VERSION"
    else
        echo "❌ $CMD is not installed."
    fi
}

if [[ "$SUCCESS" == "true" ]]; then
    echo ""
    echo "🎉 All required tools are installed and ready to use!"
    echo ""
    
    # Check all installed tools
    echo "Installed tools:"
    check_command_version git "git --version"
    check_command_version make "make --version"
    check_command_version docker "docker --version"
else
    echo "Some tools failed to install. Please check the output above for details."
    exit 1
fi
