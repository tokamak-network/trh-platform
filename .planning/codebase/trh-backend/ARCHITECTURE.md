# Architecture - trh-backend

**Analysis Date:** 2026-03-26

## Pattern Overview

**Overall:** Clean Layered Architecture with Domain-Driven Design principles

**Key Characteristics:**
- Separation of concerns across presentation, business logic, and data access layers
- Dependency injection of repositories and services
- Interface-based design for loose coupling and testability
- Async task management for long-running operations
- Repository pattern for data persistence abstraction

## Layers

**API Layer (Presentation):**
- Purpose: HTTP request handling, routing, and response serialization
- Location: `pkg/api/`
- Contains: Handlers, middleware, DTOs, route definitions, server setup
- Depends on: Services, domain entities, DTOs
- Used by: HTTP clients

**Service Layer (Business Logic):**
- Purpose: Business logic, validation, orchestration of domain operations
- Location: `pkg/services/`
- Contains: Auth service, configuration services, Thanos stack deployment service, integration managers
- Depends on: Repositories, domain entities, internal utilities
- Used by: Handlers

**Domain Layer (Entities):**
- Purpose: Core business entities and enums representing domain concepts
- Location: `pkg/domain/entities/`, `pkg/enum/`, `pkg/constants/`
- Contains: Stack, Deployment, Integration, User, AWSCredentials, Task, Log entities
- Depends on: None (isolated domain model)
- Used by: All other layers

**Infrastructure Layer (Data Access):**
- Purpose: Database connection, GORM models, repository implementations
- Location: `pkg/infrastructure/postgres/`
- Contains: Connection pooling setup, GORM schemas, repository implementations
- Depends on: Domain entities (for conversion)
- Used by: Services

**Support Layers:**
- Logger: `internal/logger/` - Uber Zap wrapper for structured logging
- Constants: `internal/consts/` - Chain IDs, cloud provider constants
- Utils: `internal/utils/` - File operations, key generation, deployment helpers

## Data Flow

**Authentication Flow:**

1. Client sends LoginRequest (email, password) to `/api/v1/auth/login`
2. AuthHandler receives request → validates via LoginRequest.Validate()
3. AuthService.Login() queries UserRepository for user by email
4. Password verified against hashed password in database
5. JWTService generates JWT token with user claims
6. AuthResponse (token + UserResponse) returned to client

**Stack Deployment Flow:**

1. Client calls handler in `pkg/api/handlers/thanos/deployment.go` with stack config
2. ThanosDeploymentHandler creates ThanosStackDeploymentService
3. ThanosService validates config, creates Stack entity via repository
4. Stack entity written to database with initial metadata and config
5. Deployment steps created for each phase (funding, presets, integrations, termination)
6. TaskManager schedules deployment task to execute steps asynchronously
7. Each step updates Deployment status in database via DeploymentRepository
8. Integrations executed concurrently via IntegrationManager
9. Final stack status updated in StackRepository
10. Client polls /api/v1/stacks/{id}/status for progress

**Integration Lifecycle:**

1. Stack deployment triggers integration setup via IntegrationManager
2. Integrations created (Bridge, BlockExplorer, Grafana, etc.)
3. Each integration implements IntegrationInterface
4. Async execution via TaskManager with progress tracking
5. Integration status updated in IntegrationRepository
6. Failures logged via LogRepository for debugging

**State Management:**

- **Database as source of truth**: All entities persisted in PostgreSQL via GORM
- **Task status tracking**: TaskManager maintains in-memory progress map keyed by task ID
- **Async operations**: Long-running deployments queued to TaskManager (5 workers default)
- **Deployment lifecycle**: Status transitions from Pending → InProgress → Success/Failed via repository updates

## Key Abstractions

**Repository Pattern:**
- Purpose: Decouple service layer from database implementation details
- Examples: `pkg/infrastructure/postgres/repositories/*.go`
- Pattern: Interface defined in service layer, PostgreSQL implementation in infrastructure layer

**Service Pattern:**
- Purpose: Encapsulate business logic and coordinate operations
- Examples: `pkg/services/thanos/service.go`, `pkg/services/auth_service.go`
- Pattern: Accepts repositories and dependencies via constructor, methods operate on injected dependencies

**DTO Pattern:**
- Purpose: Separate API request/response models from domain entities
- Examples: `pkg/api/dtos/*.go`
- Pattern: Request/response structures with validation methods, conversion to/from domain entities

**Middleware Pattern:**
- Purpose: Cross-cutting concerns (auth, logging, CORS)
- Examples: `pkg/api/middleware/jwt_middleware.go`, `pkg/api/middleware/logger_middleware.go`
- Pattern: Gin middleware functions applied to Router in setupV1Routes()

**Integration Interface Pattern:**
- Purpose: Pluggable external system integrations (Bridge, Explorer, Grafana, etc.)
- Examples: `pkg/services/thanos/integrations/interfaces.go`
- Pattern: Each integration implements Execute()/GetStatus() methods, managed by IntegrationManager

## Entry Points

**HTTP Server:**
- Location: `main.go`
- Triggers: Application startup
- Responsibilities: Environment loading, database connection, server initialization, graceful shutdown

**Route Setup:**
- Location: `pkg/api/routes/route.go` → `setupV1Routes()`
- Triggers: Server initialization
- Responsibilities: Initialize all repositories, services, handlers; register routes with middleware

**Request Handlers:**
- Location: `pkg/api/handlers/`
- Triggers: HTTP requests to registered routes
- Responsibilities: Extract request data, call service methods, format and return responses

**Async Task Execution:**
- Location: `pkg/taskmanager/task_manager.go`
- Triggers: Service methods call AddTask() or AddTaskWithProgress()
- Responsibilities: Queue task, execute with configurable worker pool, track progress, allow cancellation

## Error Handling

**Strategy:** Explicit error returns with typed error objects

**Patterns:**

- **Validation Errors**: Custom error types in DTOs (e.g., `ErrInvalidEmail`, `ErrPasswordRequired`)
- **Service Errors**: Errors from database/integration failures returned directly to handler
- **HTTP Errors**: Handler maps service errors to appropriate HTTP status codes
  - 400: Bad Request (validation errors)
  - 401: Unauthorized (invalid credentials, missing JWT)
  - 403: Forbidden (insufficient role permissions)
  - 500: Internal Server Error (database, integration failures)
- **Logging**: All errors logged with zap fields via `logger.Error()` or `logger.Errorf()`
- **Task Errors**: TaskManager catches panics in worker goroutines, logs, and marks task as failed

## Cross-Cutting Concerns

**Logging:**
- Framework: Uber Zap (structured logging)
- Wrapper: `internal/logger/logger.go` provides Info/Error/Debug/Warn/Fatal/Infof/Errorf functions
- Pattern: All significant operations log with zap.Field context (errors, request IDs, durations)

**Validation:**
- Pattern: DTO types implement Validate() methods
- Execution: Called in handlers before business logic
- Additional: GORM schema validation via struct tags

**Authentication:**
- JWT-based via `services.JWTService`
- Middleware: `JWTMiddleware.AuthMiddleware()` validates token and sets user context
- Claims: User ID, email, role stored in JWT and extracted by middleware
- Role-based access control: Handler passes required roles to middleware

**CORS:**
- Configuration: `main.go` sets up Gin CORS middleware with AllowOrigins=["*"]
- Purpose: Allow cross-origin requests from frontend

**Database Connection Pooling:**
- MaxIdleConns: 10
- MaxOpenConns: 100
- ConnMaxLifetime: 1 hour
- Auto-migration: All schemas auto-migrated on startup via GORM

---

*Architecture analysis: 2026-03-26*
