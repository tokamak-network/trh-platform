# Deferred Items

## SetupPage.test.tsx toBeInTheDocument / toBeDisabled TS2339 errors (19 errors)

- **File:** src/renderer/pages/SetupPage.test.tsx
- **Issue:** @testing-library/jest-dom matchers not typed — missing `/// <reference types="@testing-library/jest-dom" />` or vitest setup
- **Status:** Pre-existing, out of scope for 260401-mn3
- **Action needed:** Add jest-dom type reference to vitest setup or tsconfig
