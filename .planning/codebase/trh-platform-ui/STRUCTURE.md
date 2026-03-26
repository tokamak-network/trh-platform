# Codebase Structure

**Analysis Date:** 2026-03-26

## Directory Layout

```
trh-platform-ui/
├── src/
│   ├── app/                        # Next.js App Router pages and layouts
│   ├── components/                 # Reusable React components
│   ├── features/                   # Feature-specific modules
│   ├── lib/                        # Shared utilities and API client
│   ├── middleware.ts               # Next.js middleware for routing and proxying
│   └── providers/                  # Global context providers
├── public/                         # Static assets
├── tasks/                          # Task/script files (unknown purpose, not core)
├── docs/                           # Documentation and guides
├── .github/                        # GitHub workflows
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript configuration
├── next.config.ts                  # Next.js configuration
├── tailwind.config.js              # Tailwind CSS configuration
├── postcss.config.mjs              # PostCSS configuration
├── components.json                 # Shadcn component registry
├── eslint.config.mjs               # ESLint configuration
└── Dockerfile                      # Container image definition
```

## Directory Purposes

**src/app/:**
- Purpose: Next.js App Router page components and global layout
- Contains: Route segments, layout files, page components
- Key files: `layout.tsx` (root), `page.tsx` (redirects), `middleware.ts` (request handling)
- Pages: `auth/`, `rollup/`, `analytics/`, `dashboard/`, `configuration/`, `explore/`, `settings/`, `support/`, `users/`, `notification/`, `design-system/`

**src/components/:**
- Purpose: Shared UI components organized by granularity
- Contains: Atomic components (ui/), molecules (composite UI), layout wrappers, icons, authentication HOCs
- Subdirectories:
  - `ui/`: Radix UI-based primitives (button, dialog, select, alert-dialog, etc.)
  - `molecules/`: Complex UI pieces (Sidebar, LogoutButton, ApiKeySelector, RPCSelector, SaveApiKeyDialog, SaveRpcUrlDialog, PasswordInput, TaskProgress)
  - `layout/`: AuthenticatedLayout (sidebar + main content wrapper with auth guards)
  - `icon/`: SVG icon components (DashboardLogoSmIcon, RollupItemIcon, AnalyticsItemIcon, etc.)
  - `auth/`: Authentication HOCs (ProtectedRoute, RequireRole, withAuth)

**src/features/:**
- Purpose: Feature modules with feature-specific logic, components, and API calls
- Contains: Subdirectory per feature with api/, components/, hooks/, services/, schemas/, context/
- Features:
  - `auth/`: Authentication feature (login, user context, schemas)
  - `rollup/`: Rollup deployment wizard and management (multi-step form, preset selection, deployment)
  - `configuration/`: User configuration (API keys, RPC URLs, AWS credentials)
  - `integrations/`: External integrations (API, hooks, services, schemas)

**src/features/rollup/:**
- Purpose: Multi-step rollup deployment wizard
- Contains:
  - `api/`: React Query queries and mutations
  - `components/`: Rollup UI components (RollupManagement, RollupList, CreateRollupStepper, PresetSelection, StepComponents)
  - `context/`: RollupCreationContext for wizard state
  - `hooks/`: useCreateRollup, usePresetWizard, useEthereumAccounts, useFundingStatus, useThanosStack, useRollupFilter
  - `schemas/`: Zod schemas (create-rollup, preset, rollup, thanos, etc.)
  - `services/`: Service functions for rollup operations
  - `utils/`: Utility functions
  - `const.ts`: Constants (URLs, network enums)

**src/features/configuration/:**
- Purpose: User settings and configuration management
- Contains:
  - `api-keys/`: API key management components and logic
  - `aws-credentials/`: AWS credential management
  - `rpc-management/`: RPC URL configuration
  - `shared/`: Shared configuration utilities
  - `schemas.ts`: Configuration validation schemas
  - `components/`: Configuration UI components
  - `index.ts`: Exports

**src/features/auth/:**
- Purpose: Authentication and user management
- Contains:
  - `hooks/`: useAuth hook (login, logout, token management)
  - `services/`: authService (API calls for login, getCurrentUser, token storage)
  - `components/`: Auth-related UI components
  - `schemas.ts`: Zod schemas for User, LoginRequest, LoginResponse

**src/lib/:**
- Purpose: Shared utilities and configurations
- Contains:
  - `api.ts`: Axios instance, interceptors, generic request helpers (apiGet, apiPost, apiPut, apiPatch, apiDelete), error handling
  - `utils.ts`: Utility functions (cn() for class name merging)

**src/providers/:**
- Purpose: Global context and state management setup
- Contains:
  - `auth-provider.tsx`: AuthContext and useAuthContext hook
  - `query-provider.tsx`: React Query client setup with devtools
  - `toaster-provider.tsx`: react-hot-toast setup
  - `index.ts`: Exports all providers
- Loaded at: Root layout (`src/app/layout.tsx`)

**src/middleware.ts:**
- Purpose: Next.js middleware for route protection and API proxying
- Functionality:
  - Protects routes: enforces auth token for protected routes
  - Proxies API: rewrites `/api/proxy/*` to backend API URL
  - Redirects: handles auth-related redirects (authenticated → dashboard, unauthenticated → auth)

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root layout with providers
- `src/app/page.tsx`: Home (redirects to dashboard)
- `src/middleware.ts`: Request interception and routing

**Configuration:**
- `tsconfig.json`: Path alias `@/*` → `src/*`
- `next.config.ts`: Next.js settings
- `tailwind.config.js`: Tailwind CSS theme
- `.env.example`: Environment template
- `package.json`: Dependencies

**Core Logic:**
- `src/lib/api.ts`: HTTP client with interceptors
- `src/providers/auth-provider.tsx`: Global auth state
- `src/features/rollup/context/RollupCreationContext.tsx`: Wizard state

**Auth Flow:**
- `src/features/auth/hooks/useAuth.ts`: Auth hook (login, logout, token check)
- `src/features/auth/services/authService.ts`: Backend API calls
- `src/features/auth/schemas.ts`: Type definitions

**Rollup Wizard:**
- `src/features/rollup/context/RollupCreationContext.tsx`: Form state
- `src/features/rollup/schemas/create-rollup.ts`: Validation schemas
- `src/features/rollup/api/mutations.ts`: Deployment mutation
- `src/features/rollup/components/CreateRollupStepper.tsx`: Wizard UI

**Layout:**
- `src/components/layout/AuthenticatedLayout.tsx`: Sidebar + content wrapper with auth guard
- `src/components/molecules/Sidebar.tsx`: Main navigation

## Naming Conventions

**Files:**
- Pages: `page.tsx` (Next.js convention)
- Components: PascalCase (e.g., `Sidebar.tsx`, `RollupManagement.tsx`)
- Hooks: `use[HookName].ts` (e.g., `useAuth.ts`, `useCreateRollup.ts`)
- Schemas: `[feature].ts` or `[purpose]-[entity].ts` (e.g., `create-rollup.ts`, `preset.ts`)
- Services: `[feature]Service.ts` (e.g., `authService.ts`)
- Context: `[Feature]Context.tsx` (e.g., `RollupCreationContext.tsx`)

**Directories:**
- Feature modules: lowercase (e.g., `auth/`, `rollup/`, `configuration/`)
- Component directories: lowercase (e.g., `molecules/`, `ui/`, `icon/`)
- Subdirectories within features: plural (e.g., `hooks/`, `schemas/`, `services/`, `components/`)

**Functions and Variables:**
- Functions: camelCase (e.g., `useAuth`, `apiGet`, `handleApiError`)
- Constants: UPPER_SNAKE_CASE (e.g., `CHAIN_NETWORK`, `API_BASE_URL`)
- React components: PascalCase (e.g., `AuthProvider`, `Sidebar`)

## Where to Add New Code

**New Feature:**
- Create `src/features/[feature-name]/`
- Add subdirectories: `api/`, `components/`, `hooks/`, `schemas/`, `services/`
- Export public API from `src/features/[feature-name]/index.ts`
- Import from feature in page component or another feature

**New Page:**
- Create `src/app/[page-name]/page.tsx`
- Import `AuthenticatedLayout` for authenticated pages
- Render layout + main content
- If protected: layout guards, middleware blocks unauthenticated access

**New Component:**
- Atomic UI: `src/components/ui/[component].tsx` (use Radix UI or composition)
- Composite UI (molecules): `src/components/molecules/[Component].tsx`
- Feature-specific: `src/features/[feature]/components/[Component].tsx`
- Shared layout: `src/components/layout/[Component].tsx`

**New API Hook:**
- Query: `src/features/[feature]/api/queries.ts` - define with `useQuery()`
- Mutation: `src/features/[feature]/api/mutations.ts` - define with `useMutation()`
- Service call: wrapped in hook for consistency
- Export from `src/features/[feature]/api/index.ts`

**New Validation Schema:**
- `src/features/[feature]/schemas/[purpose].ts`
- Use Zod for schema definition
- Export types inferred from schema
- Use in form validation via react-hook-form

**New Utility:**
- Shared: `src/lib/[utility].ts`
- Feature-specific: `src/features/[feature]/utils/[utility].ts`
- Export from respective `index.ts` barrel file

**New Icon:**
- `src/components/icon/[IconName].tsx`
- Export from `src/components/icon/index.ts`
- Import type: `React.ComponentType<{ isSelected?: boolean } & React.SVGProps<SVGSVGElement>>`

## Special Directories

**.next/:**
- Purpose: Build output and Next.js cache
- Generated: Yes (during `npm run build`)
- Committed: No (.gitignore)

**node_modules/:**
- Purpose: Package dependencies
- Generated: Yes (via npm install)
- Committed: No (.gitignore)

**public/:**
- Purpose: Static assets served at root
- Generated: No
- Committed: Yes

**docs/:**
- Purpose: Documentation and deployment guides
- Generated: No (manually created)
- Committed: Yes

**tasks/:**
- Purpose: Unknown script/task directory
- Generated: Unknown
- Committed: Yes

**.worktrees/:**
- Purpose: Git worktree directory
- Generated: Yes (if using git worktree)
- Committed: No (.gitignore)

---

*Structure analysis: 2026-03-26*
