# External Integrations

**Analysis Date:** 2026-03-26

## APIs & External Services

**Backend API (Internal Service):**
- TRH Backend service
  - SDK: axios via `src/lib/api.ts`
  - Auth: Bearer token via Authorization header
  - Communication: API proxy through Next.js middleware at `/api/proxy/*`
  - Base URL: `http://backend:8000` (Docker) or `http://localhost:8000` (local dev)
  - Client construction: `apiClient` in `src/lib/api.ts` with configurable timeout (10 seconds)

**Blockchain/RPC Endpoints:**
- Custom RPC endpoints (user-configured)
  - SDK/Client: ethers.js v6
  - Configuration: RPC URL management in `src/features/configuration/rpc-management/`
  - Supported chains: Execution layer (EL) and Beacon chain (consensus layer)
  - Usage: Direct blockchain interaction via ethers library

## Data Storage

**Databases:**
- PostgreSQL (backend-managed, not directly accessed from UI)
  - Connection: Managed by TRH Backend service
  - Client: Backend uses connection details from `config/.env.backend`

**File Storage:**
- Local filesystem only - no cloud storage integration detected

**Caching:**
- React Query (TanStack Query)
  - Client-side data caching in browser memory
  - Configuration: `src/providers/query-provider.tsx`
  - Stale time: 1 minute (60 seconds)
  - Cache time: 10 minutes (600 seconds)
  - Retry policy: 1 retry on failure
  - Refetch on window focus: Disabled

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based authentication (backend-managed)
  - Implementation: Cookie + localStorage dual-storage
  - Token storage: `auth-token` cookie (7-day expiry, SameSite=Strict) + `accessToken` localStorage
  - Location: `src/features/auth/services/authService.ts`
  - Login flow: Email/password credentials via POST to `/api/v1/auth/login`
  - Session check: GET `/api/v1/auth/profile` for current user validation

**Auth Context:**
- React Context API for auth state management
  - Provider: `src/providers/auth-provider.tsx`
  - Hook: `useAuthContext()` for consumer components
  - State: `{ user, token, isAuthenticated, isLoading, login, logout, isLoggingIn }`

**Protected Routes:**
- Middleware-enforced authentication at `src/middleware.ts`
- Protected routes: `/dashboard`, `/admin`, `/settings`, `/rollup`, `/explore`, `/analytics`, `/users`, `/configuration`, `/notification`, `/support`
- Public routes: `/auth`, `/design-system`
- Redirect behavior: Unauthenticated requests to protected routes redirect to `/auth?redirect=[original-path]`

## HTTP Communication

**Axios Client Configuration:**
- Base URL: `/api/proxy/` (proxied through Next.js middleware)
- Timeout: 10 seconds
- Headers: Content-Type application/json, ngrok-skip-browser-warning header
- Request interceptor: Automatically injects Bearer token from localStorage/cookie
- Response interceptor: Handles 401 (removes token) and 403 (logs access denied)
- Error handling: Custom `handleApiError()` function formats errors with status and message

**API Endpoints:**
- Auth endpoints:
  - POST `/api/v1/auth/login` - User login
  - GET `/api/v1/auth/profile` - Get current user
- Configuration endpoints:
  - GET/POST `/api/v1/configuration/rpc-url` - RPC endpoint management
- Feature-specific endpoints:
  - Rollup operations
  - Integration management
  - Analytics, dashboard, users management

## Monitoring & Observability

**Error Tracking:**
- Console logging only - no external error tracking service detected
- Custom error boundaries and error handling in service layer

**Logs:**
- Browser console logs via `console.error()` in error handlers
- No centralized logging service (Sentry, DataDog, etc.) detected

## CI/CD & Deployment

**Hosting:**
- Docker container deployment
- Target: Docker Compose orchestration (backend) or standalone containerization
- Image: Built from Dockerfile with multi-stage build

**CI Pipeline:**
- Not detected in UI codebase
- Build managed via `npm run build` (part of Dockerfile)

**Development Scripts:**
```bash
npm run dev       # Start Next.js development server
npm run build     # Build for production
npm run start     # Run production server
npm run lint      # Run ESLint
```

## Environment Configuration

**Required Environment Variables:**

| Variable | Scope | Purpose | Default |
|----------|-------|---------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Client (public) | Backend API URL for local development | `http://localhost:8000` |
| `API_SERVER_URL` | Server (runtime) | Backend API URL inside Docker container | `http://backend:8000` |

**Client-Visible Variables:**
- Prefixed with `NEXT_PUBLIC_` for build-time substitution
- Can be overridden at container runtime via environment variables

**Secrets Location:**
- No secrets management detected in UI
- JWT tokens stored in cookies and localStorage
- Backend API key/credentials managed by backend service (not UI)

## Middleware & Proxying

**API Proxy:**
- Implemented in `src/middleware.ts`
- Path rewriting: `/api/proxy/*` → `http://backend:8000/api/v1/*`
- Request headers: Passes through Authorization header and ngrok-skip-browser-warning
- Solves CORS issues by proxying through Next.js server

**ngrok Support:**
- Special header `ngrok-skip-browser-warning` included in API calls
- Indicates potential use of ngrok for tunnel-based development/testing

## Webhooks & Callbacks

**Incoming:**
- Middleware authentication check on each request
- Redirect callbacks: `/auth?redirect=[path]` for post-login redirect

**Outgoing:**
- None detected

## Third-Party Integrations

**Blockchain Integration:**
- ethers.js for direct RPC interaction
- Wallet support: Mnemonic (BIP39) generation and wallet derivation
- Integration: `src/features/integrations/` for blockchain integration management

**Safe Wallet Integration:**
- Safe wallet address management (ERC-4337 multi-sig support)
- Configuration: Safe wallet info with address, threshold, owners list
- Usage: Display in integration cards and management interfaces

**Design System Support:**
- Radix UI for accessible component primitives
- shadcn/ui for composable component system
- Icon management: Lucide React with automatic icon mapping

---

*Integration audit: 2026-03-26*
