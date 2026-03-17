#!/bin/bash

# Script to verify TRH backend container setup
# Dependencies are now pre-installed in the Docker image.
# This script only verifies that the container is running and tools are available.

set -e

# Retry configuration
MAX_RETRIES=30
RETRY_DELAY=10

echo "🔍 Finding running trh-backend container..."

# Sleep for 10 seconds to ensure the container is running
sleep 10

# Function to find the running trh-backend container
find_container() {
    docker compose --env-file config/.env.docker ps -q backend --status running
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

echo "🔍 Verifying pre-installed tools in container..."

# Verify tools are available in the container
docker exec -i "$CONTAINER_ID" bash -c "
echo '📦 Verifying installed tools...'

TOOLS_OK=true

for cmd in aws terraform helm kubectl node npm npx pnpm forge cast anvil go; do
    if command -v \$cmd &> /dev/null; then
        echo \"✅ \$cmd is available\"
    else
        echo \"❌ \$cmd is NOT available\"
        TOOLS_OK=false
    fi
done

if [ \"\$TOOLS_OK\" = true ]; then
    echo ''
    echo '✅ All tools are pre-installed and available!'
else
    echo ''
    echo '⚠️  Some tools are missing. The Docker image may need to be rebuilt.'
    echo '  Run: docker buildx build --platform linux/amd64,linux/arm64 -t tokamaknetwork/trh-backend:latest --push .'
    exit 1
fi
"

echo "🎉 Container verification completed!"
