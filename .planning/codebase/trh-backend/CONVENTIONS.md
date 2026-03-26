# Coding Conventions - TRH Backend

**Analysis Date:** 2026-03-26

## Language & Version

- **Language:** Go 1.24.11
- **Module:** github.com/tokamak-network/trh-backend

## Naming Patterns

**Files:**
- Handler files: `{resource}.go` (e.g., `auth.go`, `health.go`)
- Service files: `{resource}_service.go` (e.g., `auth_service.go`, `jwt_service.go`)
- Repository files: `{entity}_repository.go` (e.g., `user_repository.go`, `deployment_repository.go`)
- Schema/Model files: `{entity}.go` (e.g., `user.go`, `api_key.go`)
- Test files: `{module}_test.go` (e.g., `presets_test.go`)
- DTOs: Grouped by domain in `pkg/api/dtos/` (e.g., `auth.go`, `aws_credentials.go`)

**Functions:**
- CamelCase, starting with verb (public): `Login()`, `GetUserByID()`, `CreateDefaultAdmin()`
- Receiver methods use short receiver names: `func (s *Service)`, `func (h *Handler)`, `func (r *Repository)`
- Godoc comments above each exported function (starting with function name)
- Handler methods use `(h *HandlerType)` receiver

**Variables:**
- CamelCase: `userRepo`, `jwtService`, `authHandler`, `postgresDB`
- Database field names use snake_case in struct tags: `gorm:"column:created_at"`
- Short abbreviations used in loops: `for _, item := range data`, `var user schemas.User`

**Types/Structs:**
- PascalCase: `AuthHandler`, `LoginRequest`, `AuthResponse`, `UserRepository`
- Embedded struct fields use full type name (not abbreviated)
- JSON/DTO fields use PascalCase: `Email`, `Password`, `Role`, `Token`
- Struct tags for validation: `binding:"required"`, `validate:"email"`
- Struct tags for JSON: `json:"email"`, `json:"password"`

**Constants/Enums:**
- PascalCase for exported: `UserRoleAdmin`, `UserRoleUser`
- HTTP status constants from net/http package used directly: `http.StatusOK`, `http.StatusBadRequest`

## Package Organization

**Standard layout:**
```
pkg/
├── api/
│   ├── dtos/           # Data Transfer Objects
│   ├── handlers/       # HTTP request handlers
│   ├── middleware/     # HTTP middleware
│   ├── routes/         # Route setup
│   └── servers/        # Server instance
├── domain/
│   └── entities/       # Business domain entities (enums, response types)
├── infrastructure/
│   └── postgres/
│       ├── connection/ # Database connection setup
│       ├── repositories/ # Data access layer
│       └── schemas/    # GORM models/schemas
├── services/           # Business logic services
├── taskmanager/        # Background task management
└── [subdomain]/        # Domain-specific packages (configuration/, thanos/)
```

**Import order pattern:**
1. Standard library: `net/http`, `os`, `context`, etc.
2. Third-party: `github.com/gin-gonic/gin`, `gorm.io/gorm`, etc.
3. Internal: `github.com/tokamak-network/trh-backend/pkg/...`
4. Internal dot imports: When needed for test setup

**Qualified imports used:**
```go
postgresRepositories "github.com/tokamak-network/trh-backend/pkg/infrastructure/postgres/repositories"
configurationHandlers "github.com/tokamak-network/trh-backend/pkg/api/handlers/configuration"
```

## Code Style

**Formatting:**
- Standard Go formatting with `gofmt`
- Formatters enabled: gofmt, gofumpt, goimports, golines, gci
- Line length considerations in golangci.yml (lll linter enabled)

**Linting:**
- Tool: golangci-lint with extensive configuration in `.golangci.yml`
- Error handling rules enforced: errcheck, errorlint, err113
- Security rules: gosec with HMAC exception in `internal/hmac/`
- Test files excluded from certain linters (gocyclo, errcheck, dupl, gosec)
- New code only analyzed: `new: true`, `new-from-merge-base: main`

**Configuration files:**
- `.golangci.yml`: Comprehensive linting configuration
- Formatters: gci, gofmt, gofumpt, goimports, golines
- Issue limits: max-issues-per-linter: 0, max-same-issues: 0
- Timeout: 5 minutes
- Go version: 1.23

## Error Handling

**Pattern - Custom error types:**
```go
type ValidationError struct {
    Message string
}

func (e *ValidationError) Error() string {
    return e.Message
}

var (
    ErrInvalidEmail = &ValidationError{Message: "invalid email format"}
    ErrUserNotFound = &ValidationError{Message: "user not found"}
)
```

**Pattern - Repository error handling:**
```go
err := r.db.Select(...).Where(...).First(&user).Error
if err != nil {
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, nil  // Treat not found as successful "no result"
    }
    return nil, err      // Return actual error
}
```

**Pattern - Handler error switching:**
```go
response, err := h.service.DoSomething()
if err != nil {
    switch err {
    case dtos.ErrInvalidCredentials:
        c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
    case dtos.ErrValidation:
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
    default:
        c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
    }
    return
}
```

**Pattern - Logger error fields:**
```go
logger.Fatal("Failed to connect", zap.Error(err))
logger.Error("Deployment failed", zap.Error(err))
```

## Logging

**Framework:** go.uber.org/zap

**Wrapper package:** `internal/logger/logger.go`

**Available methods:**
- `logger.Info(msg string, fields ...zap.Field)`
- `logger.Error(msg string, fields ...zap.Field)`
- `logger.Debug(msg string, fields ...zap.Field)`
- `logger.Warn(msg string, fields ...zap.Field)`
- `logger.Fatal(msg string, fields ...zap.Field)`
- `logger.Infof(msg string, args ...interface{})`
- `logger.Errorf(msg string, args ...interface{})`

**Patterns:**
```go
logger.Infof("Starting server on port %s", port)
logger.Fatal("Failed to connect to postgres", zap.Error(err))
logger.Info("Shutting down server...")
logger.Debug(msg string, fields ...zap.Field)  // For debug-level logs
```

**Configuration in init function:**
- Development config with ISO8601 time encoding
- Console encoding
- Stacktrace key disabled

## Validation

**Pattern - DTO validation method:**
```go
func (r *LoginRequest) Validate() error {
    if !emailRegex.MatchString(r.Email) {
        return ErrInvalidEmail
    }
    if r.Password == "" {
        return ErrPasswordRequired
    }
    return nil
}
```

**Pattern - Struct binding tags:**
```go
type LoginRequest struct {
    Email    string `json:"email" binding:"required" validate:"email"`
    Password string `json:"password" binding:"required"`
}
```

**Pattern - Early binding in handlers:**
```go
var req dtos.LoginRequest
if err := c.ShouldBindJSON(&req); err != nil {
    c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
    return
}
```

## Database Access

**ORM:** GORM v1.26.1

**Schema pattern:**
```go
type User struct {
    ID        uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid();column:id"`
    Email     string         `gorm:"column:email;not null"`
    Password  string         `gorm:"column:password;not null"`
    Role      UserRole       `gorm:"column:role;not null"`
    CreatedAt time.Time      `gorm:"autoCreateTime;column:created_at"`
    UpdatedAt time.Time      `gorm:"autoUpdateTime;column:updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"column:deleted_at;default:null"`
}
```

**Repository pattern:**
```go
type UserRepository struct {
    db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
    return &UserRepository{db: db}
}

func (r *UserRepository) Create(user *schemas.User) error {
    return r.db.Create(user).Error
}

func (r *UserRepository) FindByID(id uuid.UUID) (*schemas.User, error) {
    var user schemas.User
    err := r.db.Select("id, email, password, role, created_at, updated_at").
        Where("id = ?", id).First(&user).Error
    if err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, nil
        }
        return nil, err
    }
    return &user, nil
}
```

**Column naming:** Snake_case in GORM struct tags (auto-translated from CamelCase Go fields)

## Comments & Documentation

**Godoc pattern - Handlers:**
```go
// Login godoc
//
//	@Summary		Login user
//	@Description	Login user with email and password
//	@Tags			auth
//	@Accept			json
//	@Produce		json
//	@Param			request	body		dtos.LoginRequest	true	"Login request"
//	@Success		200		{object}	dtos.AuthResponse
//	@Failure		400		{object}	map[string]interface{}
//	@Router			/auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
```

**Swagger generation:** swaggo/swag v1.16.4 with gin-swagger integration

**Comment style:**
- Single-line comments explain "why" not "what"
- Comments for complex logic only
- Exported functions have Godoc comments
- Internal comments use `//` format

## Dependency Injection

**Pattern - Constructor injection:**
```go
type AuthService struct {
    userRepo   *repositories.UserRepository
    jwtService *JWTService
}

func NewAuthService(userRepo *repositories.UserRepository, jwtService *JWTService) *AuthService {
    return &AuthService{
        userRepo:   userRepo,
        jwtService: jwtService,
    }
}
```

**Setup in routes:**
```go
// Initialize repositories
userRepo := repositories.NewUserRepository(server.PostgresDB)

// Initialize services
jwtService := services.NewJWTService(jwtSecret)
authService := services.NewAuthService(userRepo, jwtService)

// Initialize handlers
authHandler := handlers.NewAuthHandler(authService)
```

## Middleware Pattern

**Structure:**
```go
type JWTMiddleware struct {
    jwtService *services.JWTService
}

func NewJWTMiddleware(jwtService *services.JWTService) *JWTMiddleware {
    return &JWTMiddleware{
        jwtService: jwtService,
    }
}

func (m *JWTMiddleware) AuthMiddleware(requiredRoles ...entities.UserRole) gin.HandlerFunc {
    return func(c *gin.Context) {
        // Extract and validate token
        // Set values in context
        c.Set("user_id", claims.UserID.String())
        c.Next()
    }
}
```

**Context patterns:**
- `c.Get("user_id")` - string UUID
- `c.Set()` - set value in context
- `c.Abort()` - stop processing and return error

## Testing Philosophy

**Current state:** Minimal test coverage (only `presets_test.go` found)

**Framework:** Go standard testing package with `testing.T`

**Test isolation:** Package-level test packages (`thanos_test` separate from `thanos`)

## HTTP Response Patterns

**Handler return pattern:**
```go
c.JSON(http.StatusOK, response)              // Success
c.JSON(http.StatusBadRequest, gin.H{"error": msg})  // Validation error
c.JSON(http.StatusUnauthorized, gin.H{"error": msg})  // Auth error
c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})  // Server error
```

**Response format:** Gin JSON with `gin.H{}` for error responses, typed structs for success

## Server Configuration

**Default ports:**
- Backend API: 8000
- PostgreSQL: 5432

**Environment variables:**
- PORT (default: 8000)
- POSTGRES_USER, POSTGRES_HOST, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT
- JWT_SECRET (default: "your-secret-key-change-in-production")
- DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD

**Server timeouts:**
- ReadTimeout: 120 seconds
- WriteTimeout: 120 seconds
- IdleTimeout: 180 seconds
- CORS max age: 12 hours

## File Structure Guidance

**Adding a new handler:**
- Create `pkg/api/handlers/{resource}.go`
- Define struct with service dependency
- Add Godoc comment with @Summary, @Tags, etc.
- Use constructor injection pattern

**Adding a new service:**
- Create `pkg/services/{resource}_service.go` or `pkg/services/{domain}/service.go`
- Define struct with repository dependencies
- Use constructor injection
- Return custom errors from dtos package

**Adding a new repository:**
- Create `pkg/infrastructure/postgres/repositories/{entity}_repository.go`
- Define struct with `*gorm.DB` field
- Implement CRUD methods
- Handle gorm.ErrRecordNotFound explicitly

---

*Conventions analysis: 2026-03-26*
