# External Integrations - TRH Backend

**Analysis Date:** 2026-03-26

## APIs & External Services

**Blockchain (via go-ethereum and trh-sdk):**
- Ethereum RPC endpoints - Smart contract interactions and blockchain state queries
  - Client: `github.com/ethereum/go-ethereum v1.15.2`
  - Usage: Wallet operations, contract deployments, fund transfers
  - Configuration: RPC URLs managed in `config/.env.frontend` and database

**L2 Stack Deployment (via trh-sdk):**
- Tokamak Network SDK - Core deployment and management functionality
  - Package: `github.com/tokamak-network/trh-sdk v1.0.4-0.20260323125354-d1206b4ca8b6`
  - Located in: `pkg/stacks/thanos/`, `pkg/services/thanos/`
  - Services: Stack provisioning, contract deployment, network configuration

## Data Storage

**Databases:**
- PostgreSQL 15
  - Connection: Environment variables (`POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`)
  - Client: GORM v1.26.1 with PostgreSQL driver
  - File location: `pkg/infrastructure/postgres/connection/connection.go`

**File Storage:**
- Local filesystem (container volumes)
  - Backend storage: `backend_storage` volume (defined in docker-compose.yml)
  - Deployment artifacts stored locally

**Caching:**
- None detected (no Redis or Memcached)
- Database connection pooling used for performance

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based implementation
  - Implementation: `pkg/services/jwt_service.go`, `pkg/services/auth_service.go`
  - Token generation and validation using HS256 algorithm
  - Token expiry: 24 hours
  - Claims include: user_id, email, role, standard JWT claims (iss, iat, exp)

**Default Admin Account:**
- Created on first startup if no users exist
- Email: environment variable `DEFAULT_ADMIN_EMAIL` (default: "admin@gmail.com")
- Password: environment variable `DEFAULT_ADMIN_PASSWORD` (default: "admin")
- Location: `pkg/services/auth_service.go:CreateDefaultAdmin()`

**User Roles:**
- Admin (full access)
- User (standard access)
- Role-based middleware enforcement: `pkg/api/middleware/jwt_middleware.go`

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Stack deployment callbacks via task manager
- Integration installation/uninstallation status tracking
- Real-time progress updates via polling (task progress API)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry or similar service)

**Logs:**
- Structured logging using `go.uber.org/zap v1.27.0`
- Console output in ISO8601 timestamp format
- Log level: Warn and above for production (Development config in code)
- Database logging: Log entities stored in PostgreSQL
- Location: `internal/logger/logger.go`

## Integration Services

**Block Explorer Integration:**
- File: `pkg/services/thanos/integrations/block_explorer.go`
- Functionality: Install/uninstall Blockscout or similar block explorers
- Deployment management via thanos-sdk

**Bridge Integration:**
- File: `pkg/services/thanos/integrations/bridge.go`
- Functionality: Cross-chain bridge setup and management
- Supported bridges managed via SDK

**Monitoring Integration:**
- File: `pkg/services/thanos/integrations/monitoring.go`
- Functionality: Prometheus/Grafana monitoring deployment
- Email and Telegram alert configuration

**Cross-Chain Bridge Integration:**
- File: `pkg/services/thanos/integrations/cross_trade.go`
- Functionality: Cross-chain asset trading capabilities

**Backup Manager:**
- File: `pkg/services/thanos/integrations/backup_manager.go`
- Functionality: Snapshot creation, restoration, and checkpoint management
- AWS integration for backup storage

**Candidate Registration:**
- File: `pkg/services/thanos/integrations/register_candidate.go`
- Functionality: Validator/sequencer candidate registration
- Blockchain interaction via ethereum SDK

**Metadata DAO Registration:**
- File: `pkg/services/thanos/integrations/register_medata_dao.go`
- Functionality: DAO metadata registration on blockchain

**Uptime Service (System Pulse):**
- File: `pkg/services/thanos/integrations/uptime_service.go`
- Functionality: System health and uptime monitoring

## AWS Integration

**AWS SDK v2 Integration:**
- Lazy-loaded via trh-sdk (not directly imported in go.mod)
- AWS services available:
  - EC2 - Instance management
  - S3 - File storage
  - DynamoDB - NoSQL database
  - CloudWatch Logs - Log aggregation
  - EFS - Elastic file system
  - Backup - Snapshot and restore
  - STS - Security token service
  - SSO/SSOOIDC - Single sign-on

**AWS Credentials Management:**
- DTO: `pkg/api/dtos/aws_credentials.go`
- Repository: `pkg/infrastructure/postgres/repositories/aws_credentials.go`
- Service: `pkg/services/configuration/aws_credentials_service.go`
- Handler: `pkg/api/handlers/configuration/aws_credentials.go`
- Storage: Credentials stored in PostgreSQL (schema: `AWSCredentials`)
- Validation: AWS credentials validated on configuration

## Configuration Management

**API Key Management:**
- Service: `pkg/services/configuration/api_key_service.go`
- Handler: `pkg/api/handlers/configuration/api_key.go`
- Storage: PostgreSQL table `api_keys`

**RPC URL Management:**
- Service: `pkg/services/configuration/rpc_url_service.go`
- Handler: `pkg/api/handlers/configuration/rpc_url.go`
- Storage: PostgreSQL table `rpc_urls`
- Usage: Blockchain RPC endpoint configuration

## Environment Configuration

**Required env vars:**
- `PORT` - Server port (default: 8000)
- `POSTGRES_USER` - Database user (default: postgres)
- `POSTGRES_HOST` - Database host (default: localhost)
- `POSTGRES_PASSWORD` - Database password (default: postgres)
- `POSTGRES_DB` - Database name (default: postgres)
- `POSTGRES_PORT` - Database port (default: 5432)
- `JWT_SECRET` - Secret key for JWT signing (required for production)
- `DEFAULT_ADMIN_EMAIL` - Default admin email (default: admin@gmail.com)
- `DEFAULT_ADMIN_PASSWORD` - Default admin password (default: admin)

**Secrets location:**
- Environment variables (Docker Compose loads from `config/.env.backend`)
- `.env` file (optional, loaded via godotenv)

## Service Architecture

**Task Manager:**
- Worker pool with 5 workers (configurable)
- Asynchronous task execution with progress tracking
- File: `pkg/taskmanager/task_manager.go`
- Supports progress callbacks with percentage and status messages
- Used for long-running deployment and integration operations

**Repository Pattern:**
- Repositories for each entity: Stack, Deployment, Integration, User, AWSCredentials, Log, ApiKey, RPCUrl
- Location: `pkg/infrastructure/postgres/repositories/`
- GORM ORM queries with connection pooling

**HTTP Server:**
- Gin framework
- CORS enabled (allow all origins)
- Swagger/OpenAPI documentation at `/swagger/`
- API base path: `/api/v1`
- Timeouts: Read 120s, Write 120s, Idle 180s (allows long-running operations)

**API Routes:**
- Health checks: `/api/v1/health`
- Authentication: `/api/v1/auth/login`, `/api/v1/auth/profile`
- Configuration: `/api/v1/configuration/*` (AWS credentials, RPC URLs, API keys)
- Stacks: `/api/v1/stacks/thanos/*`
- Tasks: `/api/v1/tasks/*`

---

*Integration audit: 2026-03-26*
