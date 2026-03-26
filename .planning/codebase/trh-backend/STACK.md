# Technology Stack - TRH Backend

**Analysis Date:** 2026-03-26

## Languages

**Primary:**
- Go 1.24.11 - Backend server, deployment orchestration, blockchain interactions

## Runtime

**Environment:**
- Go runtime 1.24.11

**Package Manager:**
- Go modules (go mod)
- Lockfile: `go.sum` (present)

## Frameworks

**Core:**
- Gin v1.10.0 - REST API framework and HTTP server
- GORM v1.26.1 - ORM for PostgreSQL database operations

**API Documentation:**
- Swaggo v1.16.4 - Swagger/OpenAPI documentation generation
- Gin-Swagger v1.6.0 - Swagger UI integration with Gin

**Testing:**
- Go testing (standard library) - Unit tests found in `*_test.go` files

**Build/Dev:**
- Docker - Multi-stage container builds (Go builder → Ubuntu runtime)

## Key Dependencies

**Critical:**
- `github.com/tokamak-network/trh-sdk v1.0.4-0.20260323125354-d1206b4ca8b6` - Tokamak SDK for blockchain operations, deployment management, L2 stack provisioning
- `github.com/ethereum/go-ethereum v1.15.2` - Ethereum blockchain interaction and wallet operations
- `gorm.io/driver/postgres v1.5.11` - PostgreSQL database driver for GORM
- `github.com/golang-jwt/jwt/v5 v5.2.2` - JWT token generation and validation for authentication

**Cryptography & Keys:**
- `github.com/tyler-smith/go-bip32 v1.0.0` - BIP32 hierarchical deterministic wallet support
- `github.com/tyler-smith/go-bip39 v1.1.0` - BIP39 mnemonic phrase generation and validation
- `golang.org/x/crypto v0.45.0` - Cryptographic operations (hashing, encryption)

**Infrastructure & Cloud:**
- `github.com/aws/aws-sdk-go-v2` (v1.41.1 and services) - AWS SDK v2 for EC2, S3, DynamoDB, CloudWatch Logs, EFS, STS (lazy-loaded via trh-sdk)
- `gorm.io/datatypes v1.2.5` - PostgreSQL-specific data types

**Utilities:**
- `github.com/joho/godotenv v1.5.1` - Environment variable loading from `.env` files
- `github.com/google/uuid v1.6.0` - UUID generation for IDs
- `go.uber.org/zap v1.27.0` - Structured logging framework

**CORS & HTTP:**
- `github.com/gin-contrib/cors v1.6.0` - CORS middleware for Gin

## Configuration

**Environment:**
- Loaded via `.env` file if present (optional for Docker, uses environment variables)
- Multiple configuration sources: `.env`, environment variables
- Key env vars: `PORT`, `POSTGRES_*`, `JWT_SECRET`, `DEFAULT_ADMIN_*`

**Build:**
- `Dockerfile` - Multi-stage build (Go 1.24.11 → Ubuntu runtime)
- `docker-compose.yml` - Local service orchestration
- `docker-compose.local.yml` - Alternative local composition

**Go Configuration:**
- `.golangci.yml` - Go linter configuration (15.7K)

## Platform Requirements

**Development:**
- Go 1.24.11
- Docker and Docker Compose
- PostgreSQL 15+ (via Docker)
- Node.js v20.16.0 (installed in container via NVM for foundry/forge compatibility)
- Foundry tools (forge, cast, anvil) installed in container

**Production:**
- Docker container deployment
- PostgreSQL 15+ database
- Port 8000 (HTTP API)
- Port 5432 (PostgreSQL database)

## Container Environment

The Docker image includes:
- Ubuntu latest base
- Go 1.24.11 (copied from builder stage for op-program builds during L2 deployment)
- Node.js v20.16.0 via NVM
- pnpm (installed globally)
- Foundry tools: forge, cast, anvil
- System tools: git, build-essential, curl, wget, unzip, jq, ca-certificates

**Exposed Port:** 8000 (HTTP server)

## Database

**Primary:**
- PostgreSQL 15 (or compatible)
- Connection pool settings:
  - Max idle connections: 10
  - Max open connections: 100
  - Max lifetime: 1 hour
- Database indexes created for: stacks, deployments, integrations, users, aws_credentials, logs
- Auto-migration via GORM

**Schemas:**
- `Stack` - L2 deployment stacks
- `Deployment` - Deployment tasks and operations
- `Integration` - External integrations (block explorer, bridge, monitoring, etc.)
- `User` - User authentication and roles
- `AWSCredentials` - AWS credential storage
- `Log` - Deployment and operation logs
- `ApiKey` - API key management
- `RPCUrl` - RPC endpoint configuration

---

*Stack analysis: 2026-03-26*
