# Testing Patterns

**Analysis Date:** 2026-03-26

## Current State

**Note:** No automated tests currently configured in this codebase. No test files exist (no `.test.ts`, `.test.tsx`, `.spec.ts`, `.spec.tsx` files found).

Test framework, testing library, or testing infrastructure is not yet implemented.

## Recommended Test Setup (When Implemented)

### Test Framework

**Recommended:**
- Vitest or Jest for unit/integration testing
- React Testing Library for component testing
- Playwright or Cypress for E2E testing

**Configuration files to add:**
- `vitest.config.ts` or `jest.config.js`
- Test setup file: `src/test/setup.ts`
- Testing library configuration

### Test File Organization

**Suggested Location:**
- Co-located pattern: place tests alongside source files
- Example structure:
  ```
  src/
  ├── features/
  │   ├── auth/
  │   │   ├── hooks/
  │   │   │   ├── useAuth.ts
  │   │   │   └── useAuth.test.ts
  │   │   ├── services/
  │   │   │   ├── authService.ts
  │   │   │   └── authService.test.ts
  │   ├── components/
  │   │   ├── AuthForm.tsx
  │   │   └── AuthForm.test.tsx
  ```

**Naming Convention:**
- File naming: `[ComponentName].test.tsx` or `[hookName].test.ts`
- Test suite naming: `describe("[ComponentName]", () => { ... })`
- Test case naming: `it("should [behavior]", () => { ... })`

### Run Commands (When Configured)

```bash
npm run test              # Run all tests once
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report
npm run test:ui          # Open Vitest UI (if using Vitest)
```

## Testing Architecture Recommendations

### Unit Tests

**Scope:** Individual functions, utilities, services, hooks

**Examples to test:**
- Service methods: `authService.login()`, `apiKeysService.maskApiKey()`
- Utility functions: `cn()` (className merger)
- Zod schemas: validation behavior
- Hook logic: `useAuth()`, `useApiKeys()`, `useCreateApiKey()`

**Pattern:**
```typescript
describe("useAuth", () => {
  it("should set isLoading to false after mount", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  it("should store token in localStorage on successful login", async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      result.current.login({ email: "test@example.com", password: "password" });
    });
    expect(localStorage.getItem("accessToken")).toBeTruthy();
  });
});
```

### Component Tests

**Scope:** React components with user interactions

**Examples to test:**
- `AuthForm.tsx`: Form submission, validation errors, loading state
- `Sidebar.tsx`: Navigation item clicks, active state highlighting
- `ApiKeySelector.tsx`: Dropdown filtering, selection, save dialog
- `ProtectedRoute.tsx`: Authentication redirect logic

**Pattern:**
```typescript
describe("AuthForm", () => {
  it("should render form fields", () => {
    render(<AuthForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("should call login with form data on submit", async () => {
    const mockLogin = jest.fn();
    const { getByRole } = render(
      <AuthProvider>
        <AuthForm />
      </AuthProvider>
    );

    await userEvent.type(screen.getByLabelText(/email/i), "test@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    // Verify login was called
  });

  it("should display error message on invalid email", async () => {
    render(<AuthForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "invalid-email");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
  });
});
```

### Integration Tests

**Scope:** Multiple components/services working together

**Examples to test:**
- API request flow: form submission → mutation → service call → UI update
- Query cache invalidation: create API key → refetch list → UI updated
- Auth flow: login → token stored → redirect → authenticated routes accessible

**Pattern:**
```typescript
describe("API Key Management Flow", () => {
  it("should create API key and update list", async () => {
    const { getByRole } = render(<APIKeysManagement />);

    // Open create dialog
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    // Fill form
    await userEvent.type(screen.getByPlaceholderText(/key/i), "test-key");

    // Submit
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    // Verify in list
    await waitFor(() => {
      expect(screen.getByText(/test-key/i)).toBeInTheDocument();
    });
  });
});
```

### Mocking

**Framework:** `jest.fn()` or Vitest `vi.fn()`

**What to Mock:**
- API calls using MSW (Mock Service Worker) or axios mock adapter
- `next/navigation` hooks: `useRouter`, `usePathname`, `useSearchParams`
- `@tanstack/react-query` for isolated hook testing
- External libraries with side effects

**Pattern - Service Methods:**
```typescript
describe("authService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return user on successful login", async () => {
    jest.spyOn(axios, "post").mockResolvedValueOnce({
      data: {
        data: { token: "test-token", user: { id: "1", email: "test@example.com" } }
      }
    });

    const result = await authService.login({ email: "test@example.com", password: "password" });
    expect(result.token).toBe("test-token");
  });
});
```

**Pattern - Hooks:**
```typescript
describe("useApiKeys", () => {
  it("should fetch API keys on mount", async () => {
    jest.spyOn(apiKeysService, "getApiKeys").mockResolvedValueOnce([
      { id: "1", apiKey: "key-1", type: "CMC", createdAt: "2026-03-26" }
    ]);

    const { result } = renderHook(() => useApiKeys());

    await waitFor(() => {
      expect(result.current.apiKeys).toHaveLength(1);
    });
  });
});
```

**What NOT to Mock:**
- utility functions (`cn()`)
- Zod schema validation (test actual behavior)
- Component render logic (use React Testing Library)
- Internal hook state

## Fixtures and Factories

**Test Data Location:** `src/test/fixtures/` (recommended)

**Pattern:**
```typescript
// src/test/fixtures/auth.fixtures.ts
export const mockUser = {
  id: "1",
  email: "test@example.com",
  role: "User" as const,
};

export const mockLoginResponse = {
  token: "test-token",
  user: mockUser,
};

export const mockApiKey = {
  id: "1",
  apiKey: "test-key-12345",
  type: "CMC",
  createdAt: "2026-03-26T00:00:00Z",
};
```

**Factory Function:**
```typescript
// src/test/factories/user.factory.ts
export function createUser(overrides = {}) {
  return {
    id: "1",
    email: "test@example.com",
    role: "User",
    ...overrides,
  };
}

// Usage
const customUser = createUser({ email: "admin@example.com", role: "Admin" });
```

## Coverage

**Recommendations:**
- Minimum: 60% overall coverage
- Core paths (auth, API): 80%+
- UI components: 70%+
- Utilities: 90%+

**View Coverage:**
```bash
npm run test:coverage
# Generates: coverage/
# Open: coverage/lcov-report/index.html
```

## Test Types & Examples

### Hook Testing

**Setup with React Testing Library:**
```typescript
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryProvider } from "@/providers/query-provider";
import { useAuth } from "@/features/auth/hooks/useAuth";

describe("useAuth", () => {
  it("should initialize with loading state", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: QueryProvider,
    });
    expect(result.current.isLoading).toBe(true);
  });

  it("should fetch current user", async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: QueryProvider,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});
```

### Service Testing

**Pattern:**
```typescript
describe("ApiKeysService", () => {
  let service: ApiKeysService;

  beforeEach(() => {
    service = ApiKeysService.getInstance();
  });

  it("should mask API key correctly", () => {
    const masked = service.maskApiKey("test-key-1234567890");
    expect(masked).toBe("test•••••••••••••••••••••••••••••••1234");
  });

  it("should throw error on invalid API key status 404", async () => {
    jest.spyOn(axios, "get").mockRejectedValueOnce({
      response: { status: 404, data: { message: "Not found" } }
    });

    await expect(service.getApiKey("invalid-id")).rejects.toThrow("API key not found");
  });
});
```

### Error Testing

**Pattern:**
```typescript
describe("error handling", () => {
  it("should catch and rethrow API errors", async () => {
    jest.spyOn(axios, "post").mockRejectedValueOnce({
      response: { status: 401 },
    });

    await expect(authService.login({ email: "test@example.com", password: "wrong" }))
      .rejects.toThrow("Invalid email or password");
  });

  it("should handle network errors", async () => {
    jest.spyOn(axios, "get").mockRejectedValueOnce(new Error("Network error"));

    await expect(apiKeysService.getApiKeys())
      .rejects.toThrow("Failed to fetch API keys");
  });
});
```

### Async Testing

**Pattern - Mutations:**
```typescript
describe("useCreateApiKey", () => {
  it("should create API key and update cache", async () => {
    const { result } = renderHook(() => useCreateApiKey(), {
      wrapper: QueryProvider,
    });

    await act(async () => {
      result.current.mutate({
        apiKey: "new-key",
        type: "CMC",
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("should show error toast on failure", async () => {
    jest.spyOn(apiKeysService, "createApiKey").mockRejectedValueOnce(
      new Error("Conflict")
    );

    const { result } = renderHook(() => useCreateApiKey(), {
      wrapper: QueryProvider,
    });

    await act(async () => {
      result.current.mutate({ apiKey: "dup-key", type: "CMC" });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
```

## Common Test Patterns

### Testing Protected Routes

```typescript
describe("ProtectedRoute", () => {
  it("should redirect unauthenticated users to login", () => {
    const mockUseAuthContext = jest.spyOn(require("@/providers"), "useAuthContext");
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    const mockPush = jest.fn();
    jest.spyOn(require("next/navigation"), "useRouter").mockReturnValue({
      push: mockPush,
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("/auth"));
  });
});
```

### Testing Validation

```typescript
describe("Zod Schemas", () => {
  it("should validate correct login request", () => {
    const validData = { email: "test@example.com", password: "password" };
    expect(() => loginRequestSchema.parse(validData)).not.toThrow();
  });

  it("should reject invalid email", () => {
    const invalidData = { email: "invalid-email", password: "password" };
    expect(() => loginRequestSchema.parse(invalidData)).toThrow();
  });
});
```

## Next Steps for Test Implementation

1. **Install dependencies:**
   ```bash
   npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event
   npm install --save-dev msw @vitest/ui
   ```

2. **Create configuration:**
   - `vitest.config.ts` with Next.js support
   - `src/test/setup.ts` with global setup

3. **Add test scripts to `package.json`:**
   ```json
   "test": "vitest run",
   "test:watch": "vitest",
   "test:coverage": "vitest run --coverage"
   ```

4. **Start with high-value tests:**
   - Auth flow (critical for security)
   - API key management (core feature)
   - Form validation (user-facing)

---

*Testing analysis: 2026-03-26*
