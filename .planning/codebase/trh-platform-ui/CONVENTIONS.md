# Coding Conventions

**Analysis Date:** 2026-03-26

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `AuthForm.tsx`, `Sidebar.tsx`, `ApiKeySelector.tsx`)
- Utilities/Helpers: camelCase (e.g., `utils.ts`, `api.ts`)
- Services: PascalCase with "Service" suffix (e.g., `authService.ts`, `apiKeysService.ts`)
- Hooks: camelCase with "use" prefix (e.g., `useAuth.ts`, `useApiKeys.ts`, `useAwsCredentials.ts`)
- Schemas/Types: camelCase (e.g., `schemas.ts`)
- Pages: lowercase (e.g., `page.tsx`, `layout.tsx`)

**Functions:**
- camelCase for all functions (`login`, `logout`, `handleSubmit`, `formatDate`)
- Event handlers use `handle` prefix: `handleSubmit`, `handleInputChange`, `handleApiKeySelect`
- Async functions prefix with action verb: `getCurrentUser`, `fetchApiKeys`, `createApiKey`

**Variables:**
- camelCase for all variables and constants
- Boolean flags use `is` or `show` prefix: `isLoading`, `isAuthenticated`, `showSecrets`, `isNewApiKey`
- Callback/handler variables use `on` prefix: `onChange`, `onSuccess`, `onError`, `onSaveKey`

**Types:**
- PascalCase for interfaces: `AuthContextType`, `SidebarProps`, `ApiKeySelectorProps`, `ProtectedRouteProps`
- PascalCase for type aliases: `LoginRequest`, `LoginResponse`, `AuthState`, `APIKey`
- PascalCase for schema exports: `AuthFormData`, `APIKeyFormData`

**Constants:**
- SCREAMING_SNAKE_CASE for immutable constants: `API_KEYS_QUERY_KEY = "api-keys"`, `API_BASE_URL = "/api/proxy/"`

## Code Style

**Formatting:**
- Next.js built-in ESLint (flat config in `eslint.config.mjs`)
- Tailwind CSS for styling (installed, no prettier config found - uses Next.js defaults)
- TypeScript strict mode enabled (`strict: true` in `tsconfig.json`)

**Linting:**
- ESLint config: `eslint.config.mjs` using flat config with `next/core-web-vitals` and `next/typescript`
- Rules:
  - `@typescript-eslint/no-unused-vars`: warn, ignores variables/args starting with `_`
  - `react-hooks/exhaustive-deps`: warn (dependency arrays in hooks)

**Code Patterns:**
- Use `"use client"` directive at top of client components
- Extract magic numbers to named constants at file or module level
- Use readonly props in component interfaces (e.g., `readonly id: string`)

## Import Organization

**Order:**
1. React and Next.js imports (`import React from "react"`, `import { useRouter } from "next/navigation"`)
2. Third-party library imports (`import * as z from "zod"`, `import axios from "axios"`, `import toast from "react-hot-toast"`)
3. Local component/service imports (`import { Input } from "@/components/ui/input"`, `import { authService } from "../services"`)
4. Type-only imports appear inline with regular imports (not separated)

**Path Aliases:**
- `@/*` maps to `./src/*` (defined in `tsconfig.json`)
- Always use `@/` prefix for imports: `@/components/ui/input`, `@/lib/api`, `@/features/auth/hooks`

## Error Handling

**Patterns:**
- Services use `try-catch` with explicit error type casting: `const apiError = error as ApiError;`
- Error status codes checked explicitly: `if (apiError.status === 401)`, `if (apiError.status === 404)`
- Errors thrown with user-friendly messages: `throw new Error("Invalid email or password")`
- API layer returns structured error type: `export interface ApiError { message: string; status: number; errors?: Record<string, string[]>; }`
- Mutations handle errors with `onError` callback, displaying toast: `onError: (error: Error) => { toast.error(error.message || "Failed to create API key"); }`
- Components use optional chaining and fallback values: `apiKeys = []`, `user?.email || "User"`

**Error Boundaries:**
- Use async try-catch in service methods
- Use React Query error handling in hooks with `onError` callbacks
- Use `console.error()` for logging before re-throwing (e.g., `console.error("Auth error:", error)`)

## Logging

**Framework:** Console methods only (`console.error`, `console.log`)

**Patterns:**
- Log errors before handling: `console.error("Auth error:", error)`
- Log in catch blocks for debugging
- Use `console.error()` for exceptions, warnings, failures

## Comments

**When to Comment:**
- Complex business logic (e.g., "Filter API keys based on type and input text")
- Non-obvious data transformations
- SSR/CSR concerns (e.g., `if (typeof window !== "undefined")`)
- Commented-out code indicating disabled features (e.g., Dashboard nav item temporarily disabled)

**JSDoc/TSDoc:**
- Not widely used; inline comments preferred
- Component comments above function definition: `export const Sidebar: React.FC<SidebarProps> = ({ className }) => {`

## Function Design

**Size:** Functions should be focused (50-150 lines typical, hooks can be longer)

**Parameters:**
- Use object destructuring for component props
- Spread props for pass-through: `<SidebarItem {...item} />`
- Optional props use `?:` syntax with default values in destructuring
- Readonly props in component interfaces for immutability signals

**Return Values:**
- Components return `React.ReactNode` or JSX
- Hooks return object destructuring: `return { apiKeys, isLoading, error, refetch }`
- Services return strongly typed Promise: `async login(credentials: LoginRequest): Promise<LoginResponse>`
- Utility functions return primitive types

**Async Operations:**
- Use `useMutation` from React Query for mutations
- Use `useQuery` for data fetching with cache settings: `staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000`
- Service methods always return Promise: `async getCurrentUser(): Promise<User>`

## Module Design

**Exports:**
- Named exports for utility functions: `export const cn = (...inputs: ClassValue[]) => { ... }`
- Named exports for components: `export const Sidebar: React.FC<SidebarProps> = ({ className }) => { ... }`
- Default export for pages: `export default function AuthPage() { ... }`
- Singleton pattern for services: `export const authService = AuthService.getInstance()`

**Barrel Files:**
- Used in component directories with index.ts: `export { Sidebar } from "./Sidebar"`, `export { LogoutButton } from "./LogoutButton"`
- Directory structure: `export` statements at `src/components/molecules/index.ts`

## Service Singleton Pattern

**Implementation:**
```typescript
export class AuthService {
  private static instance: AuthService;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }
}

export const authService = AuthService.getInstance();
```

**Usage:** Import singleton instance `import { authService } from "../services"`, not the class

## Form Handling

**Framework:** react-hook-form with Zod validation

**Pattern:**
```typescript
const authFormSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  password: z.string().nonempty({ message: "Password is required" }),
});

type AuthFormData = z.infer<typeof authFormSchema>;

const form = useForm<AuthFormData>({
  resolver: zodResolver(authFormSchema),
  defaultValues: { email: "", password: "", ... },
});

const handleSubmit = form.handleSubmit((data) => { ... });
```

**Validation:**
- Define schemas at module level (not inside components)
- Use Zod `.parse()` for runtime validation: `loginResponseSchema.parse(response)`
- Error messages inline with form field

## Styling

**Tailwind CSS:**
- Classes inline in JSX
- Use `cn()` utility for conditional classes: `cn("w-full max-w-md", className)`
- Combine with clsx for complex conditions: `cn("border-r border-gray-200", { "hidden": isCollapsed })`
- Tailwind classes: flex, space-y, gap, p-*, text-*, bg-*, border-*, rounded-*, w-*, h-*

**Component UI:**
- Radix UI primitives for accessibility
- Custom UI components in `src/components/ui/` wrapping Radix with Tailwind

## Type Safety

**Principles:**
- Strict mode enabled - no implicit any
- Use generics for API responses: `apiGet<T = any>()`, `useMutation<T>()`
- Type inference from Zod schemas: `type LoginRequest = z.infer<typeof loginRequestSchema>`
- Component prop interfaces always defined: `interface SidebarProps { className?: string }`

## API Client

**Base Setup:**
- Axios instance with base URL `/api/proxy/` (Next.js rewrites for CORS)
- Request interceptor adds Authorization header: `config.headers.Authorization = Bearer ${token}`
- Response interceptor handles 401 (clears token), 403 (logs access denied)
- Timeout: 10 seconds
- Generic request helpers: `apiGet<T>()`, `apiPost<T>()`, `apiPut<T>()`, `apiPatch<T>()`, `apiDelete<T>()`

---

*Convention analysis: 2026-03-26*
