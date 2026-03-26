# Architecture

**Analysis Date:** 2026-03-26

## Pattern Overview

**Overall:** Layered Next.js 15 frontend with feature-based modules and context-driven state management.

**Key Characteristics:**
- Next.js 15 App Router (server and client components)
- Feature-based directory structure (`src/features/`)
- Context API for global state (auth, rollup creation wizard)
- React Query (TanStack Query) for server state management
- Axios-based API client with middleware proxying through Next.js
- Middleware-based route protection and API request forwarding
- Type-safe schemas using Zod for validation

## Layers

**Presentation Layer:**
- Purpose: React components rendering UI and collecting user input
- Location: `src/app/`, `src/components/`
- Contains: Page components, molecules (complex UI pieces), UI atoms, layout wrappers
- Depends on: Features, providers, hooks, context
- Used by: Next.js routing system

**Feature Layer:**
- Purpose: Feature-specific business logic, API calls, schemas, and components
- Location: `src/features/[feature-name]/`
- Contains: Components, hooks, services, schemas, API queries/mutations, context (optional)
- Depends on: Lib, providers
- Used by: Presentation layer pages

**Service/API Layer:**
- Purpose: Backend communication and data fetching
- Location: `src/features/[feature-name]/services/`, `src/features/[feature-name]/api/`
- Contains: API query definitions (React Query), mutation definitions, service functions
- Depends on: `src/lib/api.ts`, Axios
- Used by: Features hooks and components

**Provider Layer:**
- Purpose: Global context and state management setup
- Location: `src/providers/`
- Contains: Context providers (auth, query, toaster, rollup creation)
- Depends on: Features hooks, React Query
- Used by: Root layout

**Utilities Layer:**
- Purpose: Shared helpers and configurations
- Location: `src/lib/`
- Contains: API client configuration, utility functions
- Depends on: Axios, environment variables
- Used by: All layers

**Middleware Layer:**
- Purpose: Request interception and routing protection
- Location: `src/middleware.ts`
- Contains: Route protection, API request forwarding to backend
- Depends on: Next.js routing, environment variables
- Used by: Next.js runtime

## Data Flow

**Authentication Flow:**

1. User visits `/` → root layout loads, wrapped in providers
2. `AuthProvider` initializes at root level
3. `useAuth` hook checks for stored token in localStorage
4. If token exists: fetch current user from backend via `authService.getCurrentUser()`
5. Auth state updates in context
6. Protected routes checked in `AuthenticatedLayout` component
7. If not authenticated: redirect to `/auth`
8. Login: `useAuth` mutation calls `authService.login()` → stores token → updates context → redirects to dashboard

**Rollup Creation Flow:**

1. User navigates to `/rollup`
2. `RollupCreationProvider` wraps the page (loaded at root)
3. `RollupManagement` component displays rollup list or create wizard
4. Wizard mode selected: "preset" or "classic"
5. Form data accumulates in `RollupCreationContext` as user progresses through steps
6. On submission: form data converted to backend request format via `convertFormToDeploymentRequest()`
7. `useCreateRollup` mutation sends deployment request to backend
8. Polling or subscription watches deployment status
9. Success: user redirected to rollup detail page

**API Request Flow:**

1. Component/hook calls `apiGet`, `apiPost`, etc. from `src/lib/api.ts`
2. Request goes to `/api/proxy/[endpoint]` (Next.js route)
3. Middleware intercepts `/api/proxy` requests and rewrites to backend URL
4. Backend URL from `API_SERVER_URL` (Docker) or `NEXT_PUBLIC_API_BASE_URL` (local dev)
5. Response returned to client
6. React Query caches response based on stale/gc times
7. Interceptor adds Bearer token from localStorage

**State Management:**

- **Global state:** Auth (context), Query state (React Query), Rollup wizard (context)
- **Component state:** Form values (react-hook-form), UI toggles (useState)
- **Server state:** Rollup list, user data (React Query)
- **Persistence:** Auth token in localStorage, React Query cache in memory

## Key Abstractions

**AuthContext:**
- Purpose: Centralize authentication state and operations
- Examples: `src/providers/auth-provider.tsx`, `src/features/auth/hooks/useAuth.ts`
- Pattern: Context + hook for consuming auth state, managed by `AuthProvider` at root

**RollupCreationContext:**
- Purpose: Manage multi-step wizard form state across navigation
- Examples: `src/features/rollup/context/RollupCreationContext.tsx`
- Pattern: Context stores form data, current step, wizard mode, selected preset
- Updates: Direct via `updateFormData()`, `updateCurrentStep()`, etc.

**API Client (Axios):**
- Purpose: Centralized HTTP client with interceptors
- Examples: `src/lib/api.ts` exports `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete`
- Pattern: Generic functions with type parameters, consistent error handling via `handleApiError()`

**Feature Services:**
- Purpose: Encapsulate API calls for a specific feature
- Examples: `src/features/auth/services/authService.ts`, `src/features/rollup/api/queries.ts`
- Pattern: Functions that call `apiClient` or higher-level helpers, return typed data

**Zod Schemas:**
- Purpose: Runtime validation and type inference
- Examples: `src/features/rollup/schemas/create-rollup.ts`
- Pattern: Define Zod schemas, infer TypeScript types, validate form data or API responses

**React Query Hooks:**
- Purpose: Manage server state with caching, polling, refetching
- Examples: `src/features/rollup/api/queries.ts`, `src/features/rollup/api/mutations.ts`
- Pattern: `useQuery()` for reads, `useMutation()` for writes, configured with stale/gc times

## Entry Points

**Root Layout:**
- Location: `src/app/layout.tsx`
- Triggers: Every page request
- Responsibilities: Load font files, set up global CSS, initialize providers (Query, Auth, Toaster, RollupCreation)

**Home Page (Redirect):**
- Location: `src/app/page.tsx`
- Triggers: User visits `/`
- Responsibilities: Redirect to dashboard

**Auth Page:**
- Location: `src/app/auth/page.tsx`
- Triggers: User not authenticated accessing protected route
- Responsibilities: Display login form, call login API

**Dashboard:**
- Location: `src/app/dashboard/page.tsx`
- Triggers: User visits `/dashboard`
- Responsibilities: Redirect to `/rollup` (primary feature)

**Rollup Management:**
- Location: `src/app/rollup/page.tsx`
- Triggers: Authenticated user visits `/rollup`
- Responsibilities: Render `RollupManagement` inside authenticated layout

**Middleware:**
- Location: `src/middleware.ts`
- Triggers: All requests except Next.js static assets
- Responsibilities:
  - Protect routes: check auth token, redirect if missing
  - Forward API requests: `/api/proxy` → backend URL
  - Redirect logic: authenticated users away from `/auth`, unauthenticated to `/auth`

## Error Handling

**Strategy:** Explicit error handling with typed error objects and user-facing notifications.

**Patterns:**

- **API Errors:** `handleApiError()` in `src/lib/api.ts` converts Axios errors to `ApiError` interface with message, status, and field-level errors
- **Validation Errors:** Zod schemas validate at component level, react-hook-form displays field errors
- **Auth Errors:** 401 response clears token, redirects to auth; 403 shows access denied message
- **Async Errors:** React Query mutations catch errors, display toast notifications via `react-hot-toast`
- **Component Errors:** Not-found page at `src/app/not-found.tsx` for 404s
- **Network Errors:** Axios retry on first failure (configured in `src/lib/api.ts`)

## Cross-Cutting Concerns

**Logging:** console.error used in error handlers and auth failure paths; no centralized logging service

**Validation:**
- Input: Zod schemas on form submission (react-hook-form)
- API response: Typed via Zod schemas (not runtime-validated)
- Custom rules: Multi-field validation via Zod `.refine()` (e.g., unique accounts, outputRootFreq multiple check)

**Authentication:**
- Token storage: localStorage
- Token attachment: Request interceptor adds `Authorization: Bearer {token}`
- Token refresh: Not implemented; 401 clears token
- Token validation: Backend validates; frontend trusts on client

**Styling:**
- Framework: Tailwind CSS v4 with PostCSS
- Utilities: `cn()` function in `src/lib/utils.ts` combines clsx and tailwind-merge
- Component library: Radix UI for accessible primitives (dialog, select, alert-dialog, etc.)

**Environment Configuration:**
- Runtime: `next-runtime-env` for accessing environment variables in client components
- API URL: `API_SERVER_URL` (server-only, Docker) or `NEXT_PUBLIC_API_BASE_URL` (public)
- Config in: `src/middleware.ts` reads and forwards to backend

**Testing Patterns:** Not detected in production code paths

---

*Architecture analysis: 2026-03-26*
