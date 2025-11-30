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
MAX_RETRIES=30
RETRY_DELAY=10

echo "🔍 Finding running trh-backend container..."

# Sleep for 10 seconds to ensure the container is running
sleep 10

# Function to find the running trh-backend container
find_container() {
    docker compose ps -q backend --status running
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
docker exec -i "$CONTAINER_ID" bash -c "
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
