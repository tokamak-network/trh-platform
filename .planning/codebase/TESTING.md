# Testing Patterns

**Analysis Date:** 2026-03-26

## Test Framework

**Runner:**
- Vitest 4.1.0
- Config: `vitest.config.mts`

**Assertion Library:**
- Vitest built-in expect (assertion library)
- @testing-library/react 16.3.2 for React component testing
- @testing-library/jest-dom 6.9.1 for DOM matchers
- @testing-library/user-event 14.6.1 for user interaction simulation

**Run Commands:**
```bash
npm test              # Run all tests once
npm run test:watch   # Watch mode with re-run on changes
```

## Test File Organization

**Location:**
- Test files co-located with source files using `.test.ts` or `.test.tsx` suffix
- Example: `src/renderer/pages/SetupPage.test.tsx` next to `src/renderer/pages/SetupPage.tsx`
- Example: `src/main/aws-auth.test.ts` next to `src/main/aws-auth.ts`
- Example: `src/main/keystore.test.ts` next to `src/main/keystore.ts`

**Naming:**
- Files match source name with `.test` inserted before extension
- Test suites use `describe()` blocks with descriptive names
- Individual tests use `it()` with behavior description

**Structure:**
```
src/
├── main/
│   ├── docker.ts
│   ├── aws-auth.ts
│   ├── aws-auth.test.ts
│   ├── keystore.ts
│   └── keystore.test.ts
├── renderer/
│   ├── pages/
│   │   ├── SetupPage.tsx
│   │   ├── SetupPage.test.tsx
│   │   ├── ConfigPage.tsx
│   │   └── ...
│   └── types.ts
└── test/
    └── setup.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('ComponentName', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    cleanup();
  });

  it('should render correctly', () => {
    // Test
  });
});
```

**Patterns:**
- Setup: `beforeEach(() => { ... })` - runs before each test
- Teardown: `afterEach(() => { cleanup(); })` - React component cleanup
- Async tests: Use `async/await` with `waitFor()` helper for async assertions
- Example from `SetupPage.test.tsx`:
  ```typescript
  it('shows key setup form after all steps complete', async () => {
    await renderAndWaitForKeySetup();
    expect(screen.getByText(/Enter your seed phrase/i)).toBeInTheDocument();
  });
  ```

## Mocking

**Framework:** Vitest's `vi` module with `vi.mock()` and `vi.fn()`

**Patterns:**

**1. Module Mocking with `vi.hoisted()` (for globals needed at load-time):**
```typescript
const { mockElectronAPI } = vi.hoisted(() => {
  const mockElectronAPI = {
    docker: {
      checkInstalled: vi.fn().mockResolvedValue(true),
      getStatus: vi.fn().mockResolvedValue({ ... }),
    },
  };
  (globalThis as any).electronAPI = mockElectronAPI;
  return { mockElectronAPI };
});
```
- Runs before any imports
- Ensures `window.electronAPI` exists when component module loads
- Used in `SetupPage.test.tsx` to mock entire Electron API

**2. Module Mocking with `vi.mock()` (for imports):**
```typescript
vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@aws-sdk/client-sso-oidc', () => ({
  SSOOIDCClient: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
}));
```
- Applied to Node.js modules and external SDKs
- Used in `aws-auth.test.ts` to mock AWS SDK clients

**3. Asset Mocking:**
```typescript
vi.mock('./SetupPage.css', () => ({}));
vi.mock('../assets/logo/logo.svg', () => ({ default: 'logo.svg' }));
```
- CSS imports mocked as empty objects
- SVG imports mocked as string paths

**What to Mock:**
- External SDK clients (AWS SDK, Electron modules)
- File system operations in unit tests (use temp directory in integration tests)
- Network calls and APIs
- CSS/SVG imports in component tests

**What NOT to Mock:**
- React hooks (`useState`, `useEffect`, `useCallback`)
- Core business logic (mnemonic validation, address derivation)
- Helper utilities (unless testing error paths)

## Fixtures and Factories

**Test Data:**
- Inline constants for test data
- Example from `SetupPage.test.tsx`:
  ```typescript
  const VALID_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  const MOCK_ADDRESSES = {
    admin: '0x9858EfFD232B4033E47d90003D41EC34EcaEdA94',
    proposer: '0x6a3B248855C2D2c4a0F3bA8A1ad62fB188f0B8DB',
    batcher: '0xdEADBEeF00000000000000000000000000000003',
    challenger: '0xdEADBEeF00000000000000000000000000000004',
    sequencer: '0xdEADBEeF00000000000000000000000000000005',
  };
  ```
- Helper function for creating log entries: `createLogLine(text)` in `SetupPage.test.tsx`

**Location:**
- Test data defined at top of test file, after imports
- Shared fixtures not yet extracted to separate files
- Mock setup helpers embedded in `beforeEach()` blocks

## Coverage

**Requirements:** Not enforced

**View Coverage:** No coverage reporting configured (vitest.config.mts does not include coverage options)

## Test Types

**Unit Tests:**
- Scope: Individual functions (aws-auth profile parsing, mnemonic validation)
- Approach: Test in isolation with mocked dependencies
- Example: `aws-auth.test.ts` tests INI parsing and profile detection without AWS SDK
- Examples: Testing with real temp files for `AWS_SHARED_CREDENTIALS_FILE` to verify file parsing logic

**Integration Tests:**
- Scope: React components with mocked Electron APIs
- Approach: Render components with full mock environment; test user interactions
- Example: `SetupPage.test.tsx` renders component and simulates user typing mnemonics
- Uses `@testing-library/user-event` to simulate real user interactions: `await user.type()`, `await user.click()`
- Waits for async state updates with `waitFor()` and specific timeout values

**E2E Tests:**
- Framework: Not used
- Comments indicate tests are intended as integration tests, not true E2E

## Common Patterns

**Async Testing:**
```typescript
it('saves seed phrase and calls onComplete', async () => {
  const user = userEvent.setup();
  await renderAndWaitForKeySetup();

  const textarea = screen.getByPlaceholderText(/Enter 12 or 24 word seed phrase/i);
  await user.clear(textarea);
  await user.type(textarea, VALID_MNEMONIC);

  await waitFor(() => {
    expect(screen.getByText('Derived Addresses')).toBeInTheDocument();
  });

  const saveBtn = screen.getByText('Save & Continue');
  await user.click(saveBtn);

  await waitFor(() => {
    expect(mockKeystore.store).toHaveBeenCalledWith(VALID_MNEMONIC);
  }, { timeout: 3000 });
});
```
- Use `async/await` for test functions
- Use `waitFor()` with explicit timeout for async assertions
- Use `userEvent.setup()` once per test; then use instance for all interactions

**Error Testing:**
```typescript
it('shows error when store fails', async () => {
  mockKeystore.store.mockRejectedValueOnce(new Error('Encryption failed'));

  const user = userEvent.setup();
  await renderAndWaitForKeySetup();

  const textarea = screen.getByPlaceholderText(/Enter 12 or 24 word seed phrase/i);
  await user.clear(textarea);
  await user.type(textarea, VALID_MNEMONIC);

  await user.click(screen.getByText('Save & Continue'));

  await waitFor(() => {
    expect(screen.getByText('Keystore Error')).toBeInTheDocument();
    expect(screen.getByText('Encryption failed')).toBeInTheDocument();
  });
});
```
- Use `mockFn.mockRejectedValueOnce()` to simulate promise rejection
- Assert error UI appears with specific error message
- Verify error state updated correctly through DOM queries

**Mock Reset Patterns:**
```typescript
beforeEach(() => {
  vi.clearAllMocks();
  onComplete.mockReset();
  // Restore default mock implementations after clearAllMocks
  mockKeystore.isAvailable.mockResolvedValue(true);
  mockKeystore.store.mockResolvedValue(undefined);
});
```
- Use `vi.clearAllMocks()` to reset all mocks
- Use `mockFn.mockReset()` for individual mocks that need full reset
- Restore default implementations after clearing since `vi.clearAllMocks()` clears call history but may affect implementations

**DOM Queries:**
```typescript
// Exact text match
screen.getByText('Save & Continue')

// Regex pattern match (case-insensitive)
screen.getByText(/Enter your seed phrase/i)

// Attribute queries
screen.getByPlaceholderText(/Enter 12 or 24 word seed phrase/i)
```
- Prefer semantic queries: `getByText()`, `getByPlaceholderText()`
- Use regex patterns with `/i` flag for case-insensitive matching
- Use `getByText()` with regex for partial matches

## Test Environment

**Setup File:** `src/test/setup.ts`
- Imports: `import '@testing-library/jest-dom/vitest'`
- Configures jest-dom matchers for use with Vitest
- Run automatically by Vitest before any tests

**Environment:** happy-dom (lightweight DOM implementation)
- Configured in `vitest.config.mts`: `environment: 'happy-dom'`
- Sufficient for React component testing without full jsdom overhead

---

*Testing analysis: 2026-03-26*
