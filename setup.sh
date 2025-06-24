#!/bin/bash

# Script to setup TRH backend container
# This script will:
# 1. Get the running trh-backend container
# 2. Execute into the container
# 3. Run the install-all-packages.sh script
# 4. Source bashrc
# 5. Exit

set -e

echo "🔍 Finding running trh-backend container..."

# Find the running trh-backend container
CONTAINER_ID=$(docker ps --filter "ancestor=tokamaknetwork/trh-backend" --format "table {{.ID}}" | tail -n +2 | head -n 1)

if [ -z "$CONTAINER_ID" ]; then
    echo "❌ No running trh-backend container found!"
    echo "Please make sure the container is running with:"
    echo "  docker-compose up -d"
    exit 1
fi

echo "✅ Found container: $CONTAINER_ID"

echo "🚀 Executing into container and running setup..."

# Execute into the container and run the commands
docker exec -it "$CONTAINER_ID" bash -c "
echo '📦 Running install-all-packages.sh...'

# Install TRH SDK packages (equivalent to what setup.sh does at the end)
wget https://raw.githubusercontent.com/tokamak-network/trh-backend/refs/heads/main/docker_install_dependencies_script.sh
chmod +x docker_install_dependencies_script.sh
DEBIAN_FRONTEND=noninteractive TZ=UTC ./docker_install_dependencies_script.sh

# Add this line to ensure pnpm is available in PATH for all processes
ln -sf /root/.local/share/pnpm/pnpm /usr/local/bin/pnpm
ln -sf /root/.foundry/bin/forge /usr/local/bin/forge
ln -sf /root/.foundry/bin/cast /usr/local/bin/cast
ln -sf /root/.foundry/bin/anvil /usr/local/bin/anvil


echo '🔄 Sourcing bashrc...'
source ~/.bashrc

echo '✅ Setup completed successfully!'
echo 'Exiting container...'
"

echo "🎉 Container setup completed!" 
