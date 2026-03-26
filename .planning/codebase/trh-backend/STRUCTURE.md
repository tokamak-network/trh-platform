# Codebase Structure - trh-backend

**Analysis Date:** 2026-03-26

## Directory Layout

```
trh-backend/
├── main.go                          # Application entry point
├── go.mod, go.sum                   # Go module dependencies
├── Dockerfile                       # Docker image build configuration
├── .env.example                     # Environment variable template
├── docker-compose.yml               # Local Docker Compose setup
├── .github/                         # GitHub workflows (CI/CD)
├── docs/                            # Swagger documentation (auto-generated)
├── internal/                        # Internal utilities (not exported)
│   ├── consts/                      # Application constants
│   │   ├── chain.go                 # Blockchain chain IDs and names
│   │   └── cloud-provider.go        # Cloud provider constants
│   ├── logger/                      # Logging wrapper
│   │   └── logger.go                # Uber Zap logger initialization and functions
│   └── utils/                       # Utility functions
│       ├── chain.go                 # Chain utility functions
│       ├── deployment.go            # Deployment helpers
│       ├── file_download.go         # File download utilities
│       ├── private_key.go           # Private key generation and handling
│       └── zip.go                   # ZIP file operations
├── pkg/                             # Public packages (exported)
│   ├── api/                         # HTTP API layer
│   │   ├── dtos/                    # Data Transfer Objects (request/response models)
│   │   │   ├── auth.go              # Login/auth DTOs
│   │   │   ├── thanos.go            # Stack deployment DTOs
│   │   │   ├── aws_credentials.go   # AWS credential DTOs
│   │   │   ├── rpc_url.go           # RPC URL configuration DTOs
│   │   │   ├── api_key.go           # API key DTOs
│   │   │   ├── backup.go            # Backup-related DTOs
│   │   │   └── cross-trade.go       # Cross-trade integration DTOs
│   │   ├── handlers/                # HTTP request handlers
│   │   │   ├── auth.go              # Authentication endpoints
│   │   │   ├── health.go            # Health check endpoint
│   │   │   ├── configuration/       # Configuration management handlers
│   │   │   │   ├── aws_credentials.go
│   │   │   │   ├── rpc_url.go
│   │   │   │   └── api_key.go
│   │   │   ├── task/                # Task status and polling handlers
│   │   │   │   └── handler.go
│   │   │   └── thanos/              # Stack deployment handlers
│   │   │       ├── base.go          # Handler initialization
│   │   │       ├── deployment.go    # Stack creation/termination endpoints
│   │   │       ├── deployment_queries.go
│   │   │       ├── presets.go       # Preset stack deployments
│   │   │       ├── candidates.go    # Candidate registration
│   │   │       ├── network.go       # Network configuration
│   │   │       ├── integrations.go  # Integration management
│   │   │       ├── queries.go       # Stack query endpoints
│   │   │       ├── registration_metadata_dao.go
│   │   │       └── presets_test.go
│   │   ├── middleware/              # HTTP middleware
│   │   │   ├── jwt_middleware.go    # JWT validation and role checking
│   │   │   └── logger_middleware.go # Request/response logging
│   │   ├── servers/                 # Server setup
│   │   │   └── server.go            # Gin server initialization
│   │   └── routes/                  # Route registration
│   │       └── route.go             # API v1 route setup
│   ├── constants/                   # Application constants
│   │   └── deployment.go            # Deployment-related constants
│   ├── domain/                      # Domain models (entities)
│   │   ├── entities/                # Core domain entities
│   │   │   ├── stack.go             # Stack entity (deployment unit)
│   │   │   ├── deployment.go        # Deployment step entity
│   │   │   ├── integration.go       # Integration entity (Bridge, Explorer, etc.)
│   │   │   ├── user.go              # User entity
│   │   │   ├── aws_credentials.go   # AWS credentials entity
│   │   │   ├── rpc_url.go           # RPC URL entity
│   │   │   ├── api_key.go           # API key entity
│   │   │   ├── task.go              # Task entity
│   │   │   ├── log.go               # Log entity
│   │   │   ├── response.go          # Response wrapper entities
│   │   │   ├── enums.go             # Enum definitions
│   │   │   └── [others]             # Additional domain entities
│   ├── enum/                        # Enum type definitions
│   │   ├── stack.go                 # Stack type enums
│   │   └── integration.go           # Integration type enums
│   ├── infrastructure/              # Data access layer
│   │   └── postgres/                # PostgreSQL implementation
│   │       ├── connection/          # Database connection setup
│   │       │   └── connection.go    # GORM initialization, pooling config
│   │       ├── schemas/             # GORM schemas (database models)
│   │       │   ├── stack.go
│   │       │   ├── deployment.go
│   │       │   ├── integration.go
│   │       │   ├── users.go
│   │       │   ├── aws_credentials.go
│   │       │   ├── api_key.go
│   │       │   ├── rpc_url.go
│   │       │   └── log.go
│   │       └── repositories/        # Repository implementations
│   │           ├── stack.go         # Stack CRUD operations
│   │           ├── deployment.go    # Deployment CRUD operations
│   │           ├── integration.go   # Integration CRUD operations
│   │           ├── user_repository.go
│   │           ├── aws_credentials.go
│   │           ├── api_key.go
│   │           ├── rpc_url.go
│   │           └── log.go
│   ├── services/                    # Business logic layer
│   │   ├── auth_service.go          # User authentication
│   │   ├── jwt_service.go           # JWT token generation/validation
│   │   ├── configuration/           # Configuration management services
│   │   │   ├── aws_credentials_service.go
│   │   │   ├── rpc_url_service.go
│   │   │   └── api_key_service.go
│   │   └── thanos/                  # Stack deployment orchestration
│   │       ├── service.go           # Main ThanosStackDeploymentService
│   │       ├── interfaces.go        # Repository and service interfaces
│   │       ├── deployment.go        # Stack deployment logic
│   │       ├── termination.go       # Stack termination logic
│   │       ├── stack_lifecycle.go   # Full lifecycle management
│   │       ├── validation.go        # Deployment validation
│   │       ├── queries.go           # Stack query operations
│   │       ├── logs.go              # Logging operations for deployments
│   │       ├── funding.go           # L1 funding operations
│   │       ├── seed_accounts.go     # Seed account operations (with tests)
│   │       ├── helpers.go           # Helper functions
│   │       ├── preset_deploy.go     # Preset deployment logic
│   │       ├── integrations/        # External system integrations
│   │       │   ├── service.go       # IntegrationManager
│   │       │   ├── interfaces.go    # Integration interfaces
│   │       │   ├── bridge.go        # Bridge integration
│   │       │   ├── block_explorer.go # Block explorer integration
│   │       │   ├── backup_manager.go # Backup management
│   │       │   ├── cross_trade.go   # Cross-trade integration
│   │       │   ├── monitoring.go    # Monitoring integration (Grafana, etc.)
│   │       │   ├── register_candidate.go # Validator candidate registration
│   │       │   ├── register_medata_dao.go
│   │       │   └── uptime_service.go # Uptime service integration
│   │       └── presets/             # Preset deployment configurations
│   │           ├── service.go       # Preset service logic
│   │           ├── types.go         # Preset type definitions
│   │           └── service_test.go  # Preset tests
│   ├── stacks/                      # Stack type definitions
│   │   └── thanos/                  # Thanos stack specifics
│   └── taskmanager/                 # Async task management
│       └── task_manager.go          # Worker pool, task scheduling, progress tracking
└── scripts/                         # Build and deployment scripts
    └── [deployment automation]
```

## Directory Purposes

**main.go:**
- Purpose: Application entry point
- Responsibilities: Load .env, initialize logger, setup database connection, start HTTP server, handle graceful shutdown

**pkg/api/:**
- Purpose: HTTP API layer encapsulating all request/response handling
- Contains: Handlers, middleware, DTOs, route definitions, server configuration
- Key pattern: Handler → Service → Repository flow with dependency injection

**pkg/domain/entities/ and pkg/enum/:**
- Purpose: Core business domain models independent of technology
- Contains: Stack, Deployment, Integration, User, Task entities and their enums/statuses
- Key pattern: Zero external dependencies, used by all layers

**pkg/infrastructure/postgres/:**
- Purpose: Database persistence implementation
- Contains: GORM schemas (database models), repositories (CRUD operations), connection pooling
- Key pattern: Repositories implement interfaces defined in service layer, schemas map to database tables via GORM tags

**pkg/services/:**
- Purpose: Business logic orchestration and validation
- Contains: Auth service, configuration services, main Thanos deployment service
- Key pattern: Accepts repositories and dependencies via constructor, implements business rules

**pkg/services/thanos/:**
- Purpose: Stack deployment orchestration (largest service)
- Contains: Deployment lifecycle, integration management, validation, queries, status updates
- Key pattern: Coordinates database operations, async task execution, external integrations

**pkg/services/thanos/integrations/:**
- Purpose: Pluggable integration with external systems
- Contains: Bridge, Block Explorer, Grafana, monitoring, backups, validator registration
- Key pattern: IntegrationManager orchestrates execution of individual integrations via TaskManager

**pkg/taskmanager/:**
- Purpose: Async task execution with worker pool
- Contains: Task scheduling, progress tracking, context-based cancellation
- Key pattern: 5-worker pool processes long-running deployments with progress callbacks

**internal/:**
- Purpose: Internal utilities not exported outside this service
- Contains: Logger wrapper, chain/cloud constants, file/key utilities
- Key pattern: Support functionality for domain and API layers

## Key File Locations

**Entry Points:**
- `main.go`: HTTP server initialization
- `pkg/api/servers/server.go`: Gin server wrapper, connection to database
- `pkg/api/routes/route.go`: Repository/service/handler initialization and route registration

**Configuration:**
- Environment loading: `main.go` (reads PORT, POSTGRES_*, JWT_SECRET)
- Database schemas: `pkg/infrastructure/postgres/schemas/*.go` (auto-migrated)
- Default admin: `pkg/services/auth_service.go` CreateDefaultAdmin()

**Core Logic:**
- Authentication: `pkg/services/auth_service.go`, `pkg/services/jwt_service.go`
- Stack deployment: `pkg/services/thanos/service.go`, `pkg/services/thanos/deployment.go`
- Database operations: `pkg/infrastructure/postgres/repositories/*.go`
- Task management: `pkg/taskmanager/task_manager.go`

**Testing:**
- Unit tests: `pkg/services/thanos/seed_accounts_test.go`, `pkg/api/handlers/thanos/presets_test.go`
- Integration tests: Not found in current structure

## Naming Conventions

**Files:**
- Lowercase with underscores: `jwt_service.go`, `aws_credentials.go`
- Entity files match entity name: `stack.go`, `deployment.go`, `user_repository.go`
- Test files use `_test.go` suffix: `seed_accounts_test.go`
- Grouped in subdirectories by feature: `handlers/thanos/`, `services/thanos/`, `services/configuration/`

**Directories:**
- Lowercase: `api`, `domain`, `infrastructure`, `services`
- Logical grouping by feature/layer: `thanos/` groups all Thanos-specific code
- Nested for further organization: `services/thanos/integrations/`, `api/handlers/configuration/`

**Functions:**
- Exported: PascalCase: `NewAuthHandler()`, `CreateDeployment()`, `Login()`
- Unexported: camelCase: `setupV1Routes()`, `createDefaultAdmin()`
- Constructors: `New{Type}()` pattern: `NewThanosService()`, `NewStackRepository()`

**Variables:**
- Receiver: Single letter (s for service, r for repository, h for handler, m for middleware)
- Interfaces: End with "Interface" or "Repository": `DeploymentRepository`, `IntegrationInterface`
- Domain constants: UPPER_SNAKE_CASE in enums: `DeploymentStatusSuccess`, `StackStatusDeploying`

**Packages:**
- Lowercase, single word: `services`, `handlers`, `middleware`
- Domain packages use plural for collections: `entities`, `repositories`, `schemas`

## Where to Add New Code

**New Feature (e.g., new stack type like "Titan"):**

1. **Domain**: Add entity file `pkg/domain/entities/titan.go` with TitanEntity struct
2. **DTOs**: Add `pkg/api/dtos/titan.go` for request/response models
3. **Infrastructure**: Add `pkg/infrastructure/postgres/schemas/titan.go` for database schema
4. **Repository**: Add `pkg/infrastructure/postgres/repositories/titan.go` implementing repository interface
5. **Service**: Add `pkg/services/titan/service.go` with business logic (follow Thanos pattern)
6. **Handler**: Add `pkg/api/handlers/titan/deployment.go` for HTTP endpoints
7. **Routes**: Register new routes in `pkg/api/routes/route.go` setupTitanRoutes()
8. **Tests**: Add `pkg/services/titan/service_test.go` and `pkg/api/handlers/titan/deployment_test.go`

**New Integration (e.g., new monitoring provider):**

1. **Interface**: Define interface in `pkg/services/thanos/integrations/interfaces.go`
2. **Implementation**: Create `pkg/services/thanos/integrations/new_provider.go`
3. **Registration**: Register in `IntegrationManager` in `pkg/services/thanos/integrations/service.go`
4. **Integration enum**: Add to `pkg/enum/integration.go`
5. **Tests**: Add `pkg/services/thanos/integrations/new_provider_test.go`

**New API Endpoint (e.g., new configuration option):**

1. **DTO**: Add request/response struct to appropriate file in `pkg/api/dtos/`
2. **Handler**: Add handler method in appropriate file in `pkg/api/handlers/`
3. **Service**: Add logic in corresponding service file in `pkg/services/`
4. **Repository**: Add database query method in appropriate repository in `pkg/infrastructure/postgres/repositories/`
5. **Routes**: Add route in `pkg/api/routes/route.go`
6. **Middleware**: Apply JWT middleware in route group if authentication required

**New Utility Function:**

- Private to package: Add to `pkg/services/thanos/helpers.go` or similar
- Shared across services: Add to `internal/utils/{feature}.go`
- Constants: Add to `pkg/constants/{feature}.go` or `internal/consts/{feature}.go`

## Special Directories

**docs/:**
- Purpose: Swagger/OpenAPI documentation
- Generated: Yes (auto-generated from comments)
- Committed: Yes (for CI/CD visibility)
- Command: `swag init` to regenerate from handler comments

**storage/:**
- Purpose: Persistent file storage for deployments (volume mount in Docker)
- Generated: Yes (created at runtime)
- Committed: No (Docker volume)

**.github/:**
- Purpose: GitHub Actions CI/CD workflows
- Generated: No
- Committed: Yes

**scripts/:**
- Purpose: Deployment and build automation
- Generated: No
- Committed: Yes (e.g., docker_install_dependencies_script.sh, install.sh)

---

*Structure analysis: 2026-03-26*
