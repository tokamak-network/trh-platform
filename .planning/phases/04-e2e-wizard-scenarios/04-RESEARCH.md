# Phase 4: E2E Wizard Scenarios - Research

**Researched:** 2026-03-27
**Domain:** Playwright E2E testing of Next.js App Router wizard UI with MSW API mocking
**Confidence:** HIGH

## Summary

trh-platform-ui는 Next.js 15 App Router 기반 webapp으로, `/rollup/create` 경로에서 Preset 배포 wizard를 제공한다. wizard는 3-step 구조(Choose Preset -> Basic Info -> Review & Deploy)이며, `usePresetWizard` hook이 상태를 관리한다. API 호출은 axios 기반 `apiGet`/`apiPost`를 통해 `/api/proxy/` 경로로 나가며, Next.js middleware가 이를 backend로 rewrite한다.

E2E 테스트를 위해 Playwright가 trh-platform-ui dev server에 직접 접속하고, MSW가 browser에서 `/api/proxy/*` 요청을 가로채 mock 응답을 반환하는 구조가 필요하다. 인증은 middleware 레벨에서 `auth-token` 쿠키를 검사하므로, Playwright에서 storageState 또는 context cookie 설정으로 우회해야 한다.

**Primary recommendation:** Playwright + MSW browser integration으로 E2E 테스트를 구성하되, 인증 우회를 위해 Playwright browser context에 `auth-token` 쿠키를 주입하고, MSW service worker를 trh-platform-ui에 추가하여 API를 mock한다. text selector와 role selector 기반으로 UI를 탐색한다 (data-testid가 없음).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 테스트 대상은 `trh-platform-ui` (Next.js webapp, localhost:3000). Electron 렌더러(ConfigPage/SetupPage)가 아님.
- **D-02:** Playwright가 trh-platform-ui dev server에 직접 접근. `playwright.config.ts`의 `webServer` 설정으로 dev server를 Playwright가 자동 시작.
- **D-03:** `playwright.config.ts`는 `trh-platform` 루트에 위치. E2E 테스트 파일은 `tests/e2e/` 디렉토리에 위치.
- **D-04:** `webServer` 설정: `{ command: 'npm run dev', url: 'http://localhost:3000', cwd: '../trh-platform-ui', reuseExistingServer: !process.env.CI }` (NOTE: trh-platform-ui uses npm, not pnpm)
- **D-05:** MSW (Mock Service Worker)를 trh-platform-ui에 추가하여 Backend API 호출을 mock. `NEXT_PUBLIC_MSW=true` 환경변수로 test 환경에서만 활성화.
- **D-06:** MSW handler는 `trh-platform-ui/src/mocks/` 디렉토리에 위치. webServer command에서 환경변수 주입.
- **D-07:** Phase 3 `PresetDeployRequestSchema`와 동일한 응답 구조로 MSW 핸들러 작성.
- **D-08:** `test.each(['general', 'defi', 'gaming', 'full'])` 로 4개 Preset 파라메트릭 커버.
- **D-09:** Funding 상태 검증은 MSW 핸들러를 통해 두 케이스(잔액 미달/충분) 분리.
- **D-10:** 배포 진행 상태 검증은 MSW로 진행 상태 이벤트 순차 반환.

### Claude's Discretion
- trh-platform-ui wizard의 실제 컴포넌트/페이지 구조와 CSS selector
- MSW handler 파일 세부 구조 및 응답 데이터 형태
- Playwright Page Object Model 사용 여부 및 helper 구조
- trh-platform-ui에 msw devDependency 추가 여부 확인

### Deferred Ideas (OUT OF SCOPE)
- trh-platform-ui 레포지토리 내부에 playwright config 추가
- playwright-electron을 이용한 Electron 앱 전체 흐름 E2E
- visual regression (스크린샷 비교)
- CrossTrade, RegisterCandidate 시나리오
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-01 | Playwright로 Preset 선택 -> 기본 정보 입력 -> 검토 화면까지 3-step wizard 흐름 검증 | Wizard 구조 완전 분석됨: PresetSelectionStep(1) -> BasicInfoStep(2) -> ConfigReview(3). 각 step의 UI 요소, selector 전략 문서화 |
| E2E-02 | 각 Preset 선택 시 올바른 모듈 미리보기와 예상 배포 시간이 표시되는지 검증 | MOCK_PRESETS에 4개 preset의 modules/estimatedTime 정의. ConfigReview에서 chainDefaults 렌더링. PresetCard에서 name/description/recommendedFor 표시 |
| E2E-03 | 잔액 미달 시 배포 버튼이 비활성화되는지 검증 | FundingStatus 컴포넌트가 `useFundingStatus` hook 사용. MSW로 funding API mock 가능. Deploy 버튼은 step 1에서만 `selectedPresetId` 없을 때 disabled |
| E2E-04 | 배포 시작 후 진행 상태가 올바르게 업데이트되는지 검증 | `startPresetDeployment` -> POST `/api/proxy/stacks/thanos/preset-deploy` -> deploymentId 반환 -> `getFundingStatus` polling. MSW로 순차 응답 가능 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | 1.58.2 | E2E browser testing | Industry standard for web E2E, CONTEXT.md에서 결정 |
| msw | 2.12.14 | API mocking in browser | Service Worker 기반, Next.js App Router 호환. CONTEXT.md에서 결정 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @playwright/test (browsers) | bundled | Chromium/Firefox/WebKit | `npx playwright install chromium` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MSW | Playwright route interception (`page.route()`) | MSW는 app 내부에서 동작하여 실제 fetch 경로를 검증. route interception은 app 외부에서 가로채므로 middleware rewrite 등 놓칠 수 있음 |

**Installation (trh-platform):**
```bash
npm install -D @playwright/test
npx playwright install chromium
```

**Installation (trh-platform-ui):**
```bash
npm install -D msw
npx msw init public/ --save
```

## Architecture Patterns

### Recommended Project Structure
```
trh-platform/
├── playwright.config.ts          # Playwright config (webServer -> ../trh-platform-ui)
├── tests/
│   ├── e2e/
│   │   ├── preset-wizard.spec.ts # 4-preset parametric E2E tests
│   │   └── helpers/
│   │       └── auth.ts           # Auth cookie injection helper
│   ├── fixtures/                 # (existing) preset fixture data
│   ├── schemas/                  # (existing) API contract schemas
│   └── unit/                     # (existing) unit tests

trh-platform-ui/
├── public/
│   └── mockServiceWorker.js      # MSW service worker (auto-generated)
├── src/
│   └── mocks/
│       ├── browser.ts            # MSW browser setup
│       ├── handlers.ts           # MSW request handlers
│       └── data/
│           └── presets.ts        # Mock preset response data
```

### Pattern 1: MSW Browser Integration with Next.js App Router
**What:** MSW v2 service worker가 browser에서 `/api/proxy/*` 요청을 가로채 mock 응답 반환
**When to use:** `NEXT_PUBLIC_MSW=true` 환경변수가 설정된 dev server 실행 시
**Critical detail:** Next.js App Router에서 MSW browser integration은 client component에서 dynamic import로 초기화해야 함

```typescript
// trh-platform-ui/src/mocks/browser.ts
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
export const worker = setupWorker(...handlers);

// trh-platform-ui/src/mocks/handlers.ts
import { http, HttpResponse } from 'msw';
import { MOCK_PRESETS } from '@/features/rollup/schemas/preset';

export const handlers = [
  // GET /api/proxy/stacks/thanos/presets
  http.get('/api/proxy/stacks/thanos/presets', () => {
    return HttpResponse.json({
      data: MOCK_PRESETS,
      success: true,
    });
  }),

  // GET /api/proxy/stacks/thanos/presets/:id
  http.get('/api/proxy/stacks/thanos/presets/:id', ({ params }) => {
    const preset = MOCK_PRESETS.find(p => p.id === params.id);
    if (!preset) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ data: preset, success: true });
  }),

  // POST /api/proxy/stacks/thanos/preset-deploy
  http.post('/api/proxy/stacks/thanos/preset-deploy', () => {
    return HttpResponse.json({
      data: { deploymentId: 'test-deploy-001' },
      success: true,
    });
  }),

  // GET /api/proxy/stacks/thanos/preset-deploy/:id/funding
  http.get('/api/proxy/stacks/thanos/preset-deploy/:id/funding', () => {
    return HttpResponse.json({
      data: {
        deploymentId: 'test-deploy-001',
        status: 'funding',
        accounts: [
          { role: 'admin', address: '0x1234...', requiredWei: '500000000000000000', currentWei: '0', fulfilled: false },
          { role: 'sequencer', address: '0x2345...', requiredWei: '500000000000000000', currentWei: '0', fulfilled: false },
          { role: 'batcher', address: '0x3456...', requiredWei: '500000000000000000', currentWei: '0', fulfilled: false },
          { role: 'proposer', address: '0x4567...', requiredWei: '500000000000000000', currentWei: '0', fulfilled: false },
        ],
        allFulfilled: false,
      },
      success: true,
    });
  }),

  // Auth endpoints
  http.get('/api/proxy/auth/profile', () => {
    return HttpResponse.json({
      data: { id: 'test-user', email: 'admin@gmail.com', role: 'Admin' },
      success: true,
    });
  }),

  http.post('/api/proxy/auth/login', () => {
    return HttpResponse.json({
      token: 'mock-jwt-token',
      user: { id: 'test-user', email: 'admin@gmail.com', role: 'Admin' },
    });
  }),
];
```

### Pattern 2: MSW Initialization in Next.js App Router
**What:** Client-side MSW worker를 app mount 전에 시작
**Critical:** `NEXT_PUBLIC_MSW` 환경변수 기반 조건부 로딩

```typescript
// trh-platform-ui/src/app/layout.tsx (수정)
// MSW provider를 app layout에 추가
// 방법 A: MSWProvider 컴포넌트 추가
// 방법 B: providers/msw-provider.tsx에서 dynamic import

// trh-platform-ui/src/providers/msw-provider.tsx
'use client';
import { useEffect, useState, type ReactNode } from 'react';

export function MSWProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const isMswEnabled = process.env.NEXT_PUBLIC_MSW === 'true';
    if (!isMswEnabled) {
      setReady(true);
      return;
    }
    import('@/mocks/browser').then(({ worker }) => {
      worker.start({ onUnhandledRequest: 'bypass' }).then(() => setReady(true));
    });
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
```

### Pattern 3: Authentication Bypass for Playwright
**What:** Playwright browser context에 auth-token 쿠키 주입으로 middleware 인증 우회
**Why:** trh-platform-ui의 middleware는 `auth-token` 쿠키로 보호된 라우트 접근을 제어

```typescript
// tests/e2e/helpers/auth.ts
import { BrowserContext } from '@playwright/test';

export async function authenticateContext(context: BrowserContext) {
  await context.addCookies([{
    name: 'auth-token',
    value: 'mock-jwt-token',
    domain: 'localhost',
    path: '/',
  }]);
  // Also set localStorage for axios interceptor
  await context.addInitScript(() => {
    localStorage.setItem('accessToken', 'mock-jwt-token');
  });
}
```

### Pattern 4: Parametric Preset Testing
**What:** `test.describe` + loop로 4개 Preset 동일 시나리오 검증

```typescript
const PRESETS = ['general', 'defi', 'gaming', 'full'] as const;

for (const preset of PRESETS) {
  test.describe(`Preset: ${preset}`, () => {
    test('completes 3-step wizard flow', async ({ page }) => {
      // Step 1: Select preset
      // Step 2: Fill basic info
      // Step 3: Review and deploy
    });
  });
}
```

### Anti-Patterns to Avoid
- **CSS class selector 의존:** Tailwind CSS 클래스는 빌드마다 변경 가능. text content, role, label 기반 selector 사용
- **MSW를 production bundle에 포함:** `NEXT_PUBLIC_MSW` 환경변수 없으면 절대 import되지 않도록 dynamic import 사용
- **하드코딩된 wait 시간:** `page.waitForSelector()` 또는 `expect(locator).toBeVisible()` 사용, `page.waitForTimeout()` 금지

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API mocking | Custom fetch interceptor | MSW v2 service worker | Browser-level interception, actual fetch 경로 유지 |
| Browser automation | Custom Puppeteer wrapper | Playwright test runner | Auto-wait, assertion retry, web-first assertions |
| Auth token management | Manual cookie injection per test | Playwright storageState / fixture | 일관된 인증 상태 관리 |
| Test data | 인라인 mock data | MOCK_PRESETS (trh-platform-ui에 이미 존재) | 단일 소스, UI와 동일한 데이터 |

## Wizard UI Structure Analysis (Source Code Verified)

### Page Route
- `/rollup/create` -> `src/app/rollup/create/page.tsx`
- Default wizard mode: `"preset"` (RollupCreationContext의 initialState)
- WizardModeTabs: "Preset Mode" | "Classic Mode" toggle

### Step 1: Choose Preset (PresetSelectionStep)
- Data source: `usePresetsQuery()` -> GET `/api/proxy/stacks/thanos/presets`
- Cards: `PresetCard` x 4 in a grid
- Each card shows: preset.name, preset.description, recommendedFor badges
- Selection: click card -> `handleSelectPreset(preset)`
- Next button: disabled when `!selectedPresetId`
- Confirmation text: "Preset selected. Click 'Next' to continue."

**Selectors:**
- Card title: text content로 선택 (`page.getByText('General Purpose')`)
- Next button: `page.getByRole('button', { name: 'Next' })`
- Previous button: `page.getByRole('button', { name: 'Previous' })` (disabled on step 1)

### Step 2: Basic Info (BasicInfoStep)
- Infrastructure Provider: "AWS Cloud" / "Local Docker" buttons
- Chain Name: input `#chainName`
- Network: Select "Testnet" / "Mainnet"
- Fee Token: Select (TON/ETH/USDT/USDC)
- L1 RPC URL: input `#l1RpcUrl`
- L1 Beacon URL: input `#l1BeaconUrl` (visible on Mainnet only; auto-filled on Testnet)
- AccountSetup: 12-word seed phrase inputs (mode="preset")
- AWS Config: shown only when infraProvider="aws"

**Selectors:**
- Chain Name: `page.locator('#chainName')`
- Network Select: `page.getByRole('combobox')` (여러 개이므로 label context 필요)
- Local Docker button: `page.getByText('Local Docker')`
- AWS Cloud button: `page.getByText('AWS Cloud')`
- L1 RPC URL: `page.locator('#l1RpcUrl')`

### Step 3: Review & Deploy (ConfigReview)
- Shows: preset name badge, description, all chainDefaults parameters
- Expert Mode toggle (Switch)
- Each parameter: label, value, unit
- Deploy button text: "Deploy Rollup" (isLastStep)

**Selectors:**
- Preset name badge: `page.getByText('{preset.name} Preset')`
- Parameter values: text content (e.g., "1800", "seconds")
- Deploy button: `page.getByRole('button', { name: 'Deploy Rollup' })`

### Footer Navigation
- Fixed footer at bottom
- Previous: `<ChevronLeft /> Previous` - disabled on step 1
- Next/Deploy: "Next" on steps 1-2, "Deploy Rollup" on step 3

## API Endpoints to Mock (MSW Handlers)

| Method | Path | Response | Used By |
|--------|------|----------|---------|
| GET | `/api/proxy/stacks/thanos/presets` | `{ data: PresetSummary[], success: true }` | PresetSelectionStep (usePresetsQuery) |
| GET | `/api/proxy/stacks/thanos/presets/:id` | `{ data: PresetDetail, success: true }` | usePresetDetailQuery |
| POST | `/api/proxy/stacks/thanos/preset-deploy` | `{ data: { deploymentId: string }, success: true }` | handleDeploy (usePresetWizard) |
| GET | `/api/proxy/stacks/thanos/preset-deploy/:id/funding` | `{ data: FundingStatusResponse, success: true }` | useFundingStatusQuery |
| GET | `/api/proxy/auth/profile` | `{ data: User, success: true }` | AuthProvider (useAuth) |
| POST | `/api/proxy/auth/login` | `{ token: string, user: User }` | AuthService.login |

**Response wrapper:** 모든 API 응답은 `{ data: T, success: boolean, message?: string }` 형태 (`ApiResponse<T>`)

**Critical:** Auth profile endpoint는 app 초기 로딩 시 호출됨. MSW가 이를 mock하지 않으면 401 에러 -> /auth로 리다이렉트됨.

## Authentication Flow (Critical for E2E)

1. **Middleware level:** `auth-token` 쿠키 존재 여부 확인. 없으면 `/auth`로 리다이렉트
2. **Client level:** `localStorage.getItem('accessToken')` -> axios request interceptor에서 `Authorization: Bearer` 헤더 추가
3. **AuthProvider:** mount 시 `authService.getCurrentUser()` 호출 -> GET `/api/proxy/auth/profile`

**E2E 전략:**
- Playwright context에 `auth-token` 쿠키 주입 (middleware 통과)
- `addInitScript`로 `localStorage.accessToken` 설정 (axios interceptor 통과)
- MSW handler로 `/api/proxy/auth/profile` mock (AuthProvider 통과)

## Funding Status Scenarios (E2E-03)

FundingStatus 컴포넌트는 `deploymentId`가 있을 때만 활성화된다. 현재 wizard flow에서는:
1. Step 3에서 "Deploy Rollup" 클릭
2. `handleDeploy` -> `startPresetDeployment` POST -> `deploymentId` 반환
3. `setPendingDeploymentId(result.deploymentId)` -> router.push('/rollup')
4. `/rollup` 페이지에서 FundingStatus가 표시됨

**E2E-03 검증 전략 수정:** 현재 wizard의 Deploy 버튼은 step 1에서만 `selectedPresetId` 없을 때 disabled. Step 3의 Deploy 버튼은 항상 enabled. 잔액 미달 시 배포 버튼 비활성화는 FundingStatus 컴포넌트 레벨에서 `allFulfilled`가 false일 때 별도 조건 없이 배포는 진행되고, funding 상태만 표시됨.

**실제 동작:** Deploy 클릭 -> 배포 시작 -> FundingStatus polling -> 잔액 미달이면 "Pending" 상태 유지. 잔액 충분이면 "Ready to Deploy" -> 배포 진행.

따라서 E2E-03 검증은:
- MSW에서 funding API가 `allFulfilled: false` 반환 -> FundingStatus에 "Pending" badge + "0 of 4 accounts funded" 표시 확인
- MSW에서 funding API가 `allFulfilled: true` 반환 -> "All accounts are funded" 메시지 확인

## Package Manager Correction

CONTEXT.md의 D-04에서 `pnpm dev`를 명시했지만, trh-platform-ui는 npm을 사용한다 (package-lock.json 존재, pnpm-lock.yaml 없음). webServer command를 `npm run dev`로 수정해야 한다:

```typescript
// playwright.config.ts
webServer: {
  command: 'NEXT_PUBLIC_MSW=true npm run dev',
  url: 'http://localhost:3000',
  cwd: '../trh-platform-ui',
  reuseExistingServer: !process.env.CI,
}
```

## No data-testid Attributes

trh-platform-ui 전체 소스에 `data-testid` 속성이 하나도 없다. Playwright selector 전략:

1. **Role-based:** `page.getByRole('button', { name: 'Next' })`
2. **Text-based:** `page.getByText('Choose a Deployment Preset')`
3. **Label-based:** `page.getByLabel('Chain Name')`
4. **ID-based:** `page.locator('#chainName')` (HTML id 속성 사용)
5. **Structural:** `page.locator('.grid-cols-1 >> nth=0')` (최후 수단)

Radix UI Select는 native `<select>` 대신 custom dropdown을 사용하므로, `getByRole('combobox')` + `getByRole('option', { name: 'Testnet' })` 패턴 필요.

## Common Pitfalls

### Pitfall 1: MSW Service Worker Not Starting Before Page Load
**What goes wrong:** Playwright가 페이지 로드하는데 MSW worker가 아직 시작 안 됨. API 요청이 실제 backend로 가서 실패.
**Why it happens:** Next.js App Router의 async component 로딩과 MSW worker.start()가 race condition
**How to avoid:** MSWProvider에서 `ready` state가 true가 될 때까지 children 렌더링을 차단. Playwright에서 `page.waitForResponse()` 또는 특정 UI 요소가 보일 때까지 대기.
**Warning signs:** 테스트가 간헐적으로 실패, "Failed to load presets" 에러 표시

### Pitfall 2: Next.js Middleware Auth Redirect
**What goes wrong:** Playwright가 `/rollup/create`로 이동했는데 `/auth`로 리다이렉트됨
**Why it happens:** `auth-token` 쿠키가 browser context에 없음
**How to avoid:** `test.beforeEach`에서 `authenticateContext(context)` 호출. 쿠키를 `beforeAll`이 아닌 각 테스트 전에 설정.
**Warning signs:** 모든 테스트가 auth 페이지에서 실패

### Pitfall 3: Radix UI Select Interaction
**What goes wrong:** `page.selectOption()` 사용 시 동작하지 않음
**Why it happens:** Radix UI Select는 native select가 아닌 custom dropdown. DOM에 `<select>` 없음.
**How to avoid:** trigger 클릭 -> option 클릭 패턴:
```typescript
await page.getByLabel('Network').click(); // trigger
await page.getByRole('option', { name: 'Testnet' }).click();
```
**Warning signs:** "No option with text" 에러

### Pitfall 4: React Hook Form Validation Timing
**What goes wrong:** Step 2에서 Next 클릭 시 validation 실패
**Why it happens:** `react-hook-form`의 `trigger("presetBasicInfo")`가 비동기. Playwright가 값 설정 후 즉시 Next 클릭하면 validation이 아직 완료되지 않음.
**How to avoid:** `page.fill()` 후 `blur` 이벤트 대기, 또는 error message가 없어진 것 확인 후 Next 클릭.
**Warning signs:** "required" validation 에러가 간헐적으로 표시

### Pitfall 5: MSW Handler Response Wrapper Mismatch
**What goes wrong:** API 응답을 받았는데 UI에 데이터가 표시되지 않음
**Why it happens:** trh-platform-ui의 `apiGet`은 `response.data`를 반환하는데, axios가 실제로는 `{ data: { data: T, success: true } }` 구조. MSW 응답이 이 wrapper를 포함하지 않으면 undefined.
**How to avoid:** MSW handler 응답에 반드시 `{ data: T, success: true }` wrapper 포함
**Warning signs:** "Cannot read property of undefined" 에러

## Code Examples

### Playwright Config
```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'NEXT_PUBLIC_MSW=true npm run dev',
    url: 'http://localhost:3000',
    cwd: '../trh-platform-ui',
    reuseExistingServer: !process.env.CI,
    timeout: 120000, // Next.js dev server can be slow to start
  },
});
```

### E2E Test Structure
```typescript
// tests/e2e/preset-wizard.spec.ts
import { test, expect } from '@playwright/test';

const PRESETS = ['general', 'defi', 'gaming', 'full'] as const;

test.beforeEach(async ({ context }) => {
  // Inject auth cookie for middleware bypass
  await context.addCookies([{
    name: 'auth-token',
    value: 'mock-jwt-token',
    domain: 'localhost',
    path: '/',
  }]);
  await context.addInitScript(() => {
    localStorage.setItem('accessToken', 'mock-jwt-token');
  });
});

for (const preset of PRESETS) {
  test.describe(`${preset} preset wizard`, () => {
    test('E2E-01: completes 3-step wizard flow', async ({ page }) => {
      await page.goto('/rollup/create');

      // Wait for MSW to intercept and presets to load
      await expect(page.getByText('Choose a Deployment Preset')).toBeVisible();

      // Step 1: Select preset
      const presetNames = { general: 'General Purpose', defi: 'DeFi', gaming: 'Gaming', full: 'Full Suite' };
      await page.getByText(presetNames[preset]).click();
      await expect(page.getByText('Preset selected')).toBeVisible();
      await page.getByRole('button', { name: 'Next' }).click();

      // Step 2: Fill basic info
      await expect(page.getByText('Infrastructure Provider')).toBeVisible();
      await page.getByText('Local Docker').click();
      await page.locator('#chainName').fill('test-chain');
      await page.locator('#l1RpcUrl').fill('https://eth-sepolia.example.com');
      // Fill seed phrase... (12 inputs)
      await page.getByRole('button', { name: 'Next' }).click();

      // Step 3: Review
      await expect(page.getByText('Preset Configuration Review')).toBeVisible();
    });
  });
}
```

### MSW Handler with Scenario Switching
```typescript
// For E2E-03: funding status scenarios
let fundingScenario: 'unfunded' | 'funded' = 'unfunded';

http.get('/api/proxy/stacks/thanos/preset-deploy/:id/funding', () => {
  if (fundingScenario === 'funded') {
    return HttpResponse.json({
      data: {
        deploymentId: 'test-deploy-001',
        status: 'ready',
        accounts: [
          { role: 'admin', address: '0x1234...', requiredWei: '500000000000000000', currentWei: '500000000000000000', fulfilled: true },
          // ... all fulfilled
        ],
        allFulfilled: true,
      },
      success: true,
    });
  }
  return HttpResponse.json({
    data: {
      deploymentId: 'test-deploy-001',
      status: 'funding',
      accounts: [
        { role: 'admin', address: '0x1234...', requiredWei: '500000000000000000', currentWei: '0', fulfilled: false },
        // ... all unfunded
      ],
      allFulfilled: false,
    },
    success: true,
  });
});
```

## Existing Mock Data (Reusable)

trh-platform-ui에 이미 `MOCK_PRESETS`와 `MOCK_PRESET_DETAILS`가 `src/features/rollup/schemas/preset.ts`에 정의되어 있다. `USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true"`로 활성화 가능.

**두 가지 mock 경로:**
1. `NEXT_PUBLIC_USE_MOCK=true` -> presetService.ts에서 직접 MOCK_PRESETS 반환 (네트워크 요청 없음)
2. `NEXT_PUBLIC_MSW=true` -> MSW가 네트워크 요청을 가로채 mock 응답 반환

**추천:** E2E에서는 MSW 사용 (D-05). `NEXT_PUBLIC_USE_MOCK`은 개발 편의용이고, MSW는 실제 네트워크 요청 경로를 검증하므로 E2E에 적합. 단, MSW handler의 응답 데이터로 동일한 `MOCK_PRESETS`를 재사용할 수 있다.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MSW v1 (rest.get) | MSW v2 (http.get, HttpResponse) | 2023 | Import path, handler syntax 전면 변경 |
| Playwright .route() only | MSW + Playwright | Current | App 내부 mock으로 실제 fetch 경로 검증 |
| data-testid 의존 | Role/text selector | Current Playwright best practice | 접근성 기반 selector가 더 안정적 |

## Open Questions

1. **Seed phrase input 자동화**
   - What we know: AccountSetup 컴포넌트에 12개 word input이 있다. mode="preset"에서의 정확한 DOM 구조를 확인해야 한다.
   - What's unclear: 각 input의 selector (id? name? index?)
   - Recommendation: AccountSetup.tsx를 읽어 input 구조 파악 후 helper 함수로 12단어 자동 입력

2. **E2E-04 배포 진행 상태 검증 범위**
   - What we know: Deploy 버튼 클릭 후 `router.push('/rollup')`로 이동하며, `/rollup` 페이지에서 deployment 상태가 표시됨
   - What's unclear: `/rollup` 페이지의 deployment 상태 표시 컴포넌트 구조
   - Recommendation: deploy 후 redirect된 `/rollup` 페이지에서 toast message("Deployment initiated!") 확인 + deployment list에 새 항목 표시 확인으로 범위 제한

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | Yes | v20.20.1 | -- |
| npm | Package install | Yes | bundled | -- |
| Chromium (Playwright) | E2E browser | No (install needed) | -- | `npx playwright install chromium` |
| @playwright/test | E2E framework | No (install needed) | 1.58.2 (latest) | `npm install -D @playwright/test` |
| msw | API mocking | No (install needed in trh-platform-ui) | 2.12.14 (latest) | `npm install -D msw` |
| trh-platform-ui source | Test target | Yes | Adjacent repo | -- |

**Missing dependencies with no fallback:**
- None (all can be installed)

**Missing dependencies with fallback:**
- Chromium browser: auto-installed by `npx playwright install chromium`

## Sources

### Primary (HIGH confidence)
- trh-platform-ui source code (직접 읽음): wizard 구조, API 경로, 인증 로직, mock 데이터
- trh-platform source code (직접 읽음): 기존 테스트 구조, fixture, schema
- npm registry: @playwright/test 1.58.2, msw 2.12.14 (verified)

### Secondary (MEDIUM confidence)
- MSW v2 browser integration with Next.js App Router: MSW 공식 문서 패턴 기반 추천
- Playwright webServer config: Playwright 공식 문서 기반

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - npm registry에서 버전 확인, CONTEXT.md에서 결정됨
- Architecture: HIGH - 소스코드 직접 분석하여 wizard 구조, API 경로, 인증 로직 완전 파악
- Pitfalls: HIGH - Next.js middleware 인증, Radix UI Select, MSW race condition 등 코드 기반 확인

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable stack, UI 구조 변경 시 갱신 필요)
