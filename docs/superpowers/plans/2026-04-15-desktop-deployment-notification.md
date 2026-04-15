# Desktop Deployment Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Electron 메인 프로세스가 백엔드 API를 10초 간격으로 폴링하여 L2 스택/인테그레이션 배포 완료/실패 시 OS 데스크탑 알림과 인앱 알림을 발송한다.

**Architecture:** `src/main/deployment-watcher.ts` 신규 모듈이 폴링 전담. `webview.ts`에서 `getCachedAuthToken()`을 export하여 watcher가 인증 토큰을 받는다. `index.ts`에서 플랫폼 준비 완료 후 watcher를 시작하고 앱 종료 시 정지한다.

**Tech Stack:** Electron `Notification` API, Node.js `setInterval`, TypeScript strict mode, Vitest (유닛 테스트)

---

## File Map

| 파일 | 역할 | 변경 |
|------|------|------|
| `src/main/deployment-watcher.ts` | 폴링 + 상태 비교 + 알림 발송 전담 | **신규 생성** |
| `src/main/notifications.ts` | in-app 알림 스토어 | `AppNotification.type`에 `'deployment'` 추가 |
| `src/renderer/types.ts` | 렌더러 공유 타입 | `AppNotification.type`에 `'deployment'` 추가 (notifications.ts와 동기화) |
| `src/main/webview.ts` | 인증 토큰 캐시 | `getCachedAuthToken()` 함수 export 추가 |
| `src/main/index.ts` | 앱 라이프사이클 | watcher import, `app:load-platform` 후 `start()`, `before-quit` 시 `stop()` |
| `tests/unit/deployment-watcher.test.ts` | watcher 유닛 테스트 | **신규 생성** |

---

## Task 1: `AppNotification` 타입에 `'deployment'` 추가

두 파일에서 `AppNotification.type` 유니온을 동일하게 수정한다.

**Files:**
- Modify: `src/main/notifications.ts:5`
- Modify: `src/renderer/types.ts:36`

- [ ] **Step 1: `src/main/notifications.ts` 타입 수정**

`type` 필드를 다음으로 교체:

```typescript
type: 'image-update' | 'release-update' | 'system' | 'deployment';
```

`notifications.ts` 5번째 줄:
```typescript
export interface AppNotification {
  id: string;
  type: 'image-update' | 'release-update' | 'system' | 'deployment';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actionLabel?: string;
  actionType?: 'update-containers';
}
```

- [ ] **Step 2: `src/renderer/types.ts` 타입 수정**

36번째 줄의 동일한 인터페이스도 똑같이 수정:

```typescript
export interface AppNotification {
  id: string;
  type: 'image-update' | 'release-update' | 'system' | 'deployment';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actionLabel?: string;
  actionType?: 'update-containers';
}
```

- [ ] **Step 3: 타입 체크 통과 확인**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: 커밋**

```bash
git add src/main/notifications.ts src/renderer/types.ts
git commit -m "feat(notifications): add 'deployment' type to AppNotification union"
```

---

## Task 2: `webview.ts`에서 `getCachedAuthToken()` export

**Files:**
- Modify: `src/main/webview.ts`

- [ ] **Step 1: `cachedAuthToken` 반환 함수 추가**

`webview.ts`의 `destroyPlatformView` 함수 **위**에 다음을 삽입:

```typescript
/**
 * Returns the currently cached auth token, or null if not yet obtained.
 * Used by deployment-watcher to authenticate backend API polling requests.
 */
export function getCachedAuthToken(): string | null {
  return cachedAuthToken;
}
```

- [ ] **Step 2: 타입 체크 통과 확인**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add src/main/webview.ts
git commit -m "feat(webview): export getCachedAuthToken for deployment watcher"
```

---

## Task 3: `deployment-watcher.ts` 신규 생성 (failing test 먼저)

**Files:**
- Create: `src/main/deployment-watcher.ts`
- Create: `tests/unit/deployment-watcher.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/unit/deployment-watcher.test.ts` 파일을 생성:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (must be defined before importing the module under test)
// ---------------------------------------------------------------------------

// Mock Electron Notification
const mockNotificationShow = vi.fn();
const MockNotification = vi.fn().mockImplementation(() => ({ show: mockNotificationShow }));
(MockNotification as unknown as { isSupported: () => boolean }).isSupported = vi.fn().mockReturnValue(true);

vi.mock('electron', () => ({
  Notification: MockNotification,
}));

// Mock NotificationStore
const mockStoreAdd = vi.fn().mockReturnValue({ id: 'mock-id', type: 'deployment', title: '', message: '', timestamp: 0, read: false });
vi.mock('../../src/main/notifications', () => ({
  add: mockStoreAdd,
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { DeploymentWatcher } from '../../src/main/deployment-watcher';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StackStatus = 'Deploying' | 'Updating' | 'Deployed' | 'FailedToDeploy' | 'FailedToUpdate' | 'Idle';
type IntegrationStatus = 'InProgress' | 'Completed' | 'Failed';

function makeStack(id: string, name: string, status: StackStatus) {
  return { id, name, status };
}

function makeIntegration(id: string, type: string, status: IntegrationStatus) {
  return { id, type, status };
}

function makeGetToken(token: string | null) {
  return () => token;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeploymentWatcher', () => {
  let watcher: DeploymentWatcher;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    watcher = new DeploymentWatcher('http://localhost:8000');
  });

  afterEach(() => {
    watcher.stop();
  });

  // DW-01: No notification on initial load (no previous state)
  it('DW-01: does not fire notification on initial state snapshot', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deploying')] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { integrations: [] } }),
      });

    await watcher.poll(makeGetToken('test-token'));

    expect(mockNotificationShow).not.toHaveBeenCalled();
    expect(mockStoreAdd).not.toHaveBeenCalled();
  });

  // DW-02: Deploying → Deployed fires success notification
  it('DW-02: Deploying → Deployed fires L2 Deployment Complete notification', async () => {
    // First poll: snapshot Deploying
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deploying')] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { integrations: [] } }),
      });
    await watcher.poll(makeGetToken('test-token'));

    vi.clearAllMocks();

    // Second poll: transition to Deployed
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deployed')] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { integrations: [] } }),
      });
    await watcher.poll(makeGetToken('test-token'));

    expect(mockNotificationShow).toHaveBeenCalledTimes(1);
    expect(MockNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'L2 Deployment Complete' }),
    );
    expect(mockStoreAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'deployment', title: 'L2 Deployment Complete' }),
    );
    const addArgs = mockStoreAdd.mock.calls[0][0] as { message: string };
    expect(addArgs.message).toContain('my-chain');
    expect(addArgs.message).toContain('is now deployed and running');
  });

  // DW-03: Deploying → FailedToDeploy fires failure notification
  it('DW-03: Deploying → FailedToDeploy fires L2 Deployment Failed notification', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deploying')] } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { integrations: [] } }) });
    await watcher.poll(makeGetToken('token'));

    vi.clearAllMocks();

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'FailedToDeploy')] } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { integrations: [] } }) });
    await watcher.poll(makeGetToken('token'));

    expect(mockNotificationShow).toHaveBeenCalledTimes(1);
    expect(MockNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'L2 Deployment Failed' }),
    );
  });

  // DW-04: Same status → no notification
  it('DW-04: same status on consecutive polls does not fire notification', async () => {
    for (let i = 0; i < 2; i++) {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deployed')] } }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { integrations: [] } }) });
      await watcher.poll(makeGetToken('token'));
    }

    expect(mockNotificationShow).not.toHaveBeenCalled();
  });

  // DW-05: InProgress → Completed fires service notification
  it('DW-05: InProgress → Completed fires Service Deployment Complete notification', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deployed')] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { integrations: [makeIntegration('i1', 'bridge', 'InProgress')] } }),
      });
    await watcher.poll(makeGetToken('token'));

    vi.clearAllMocks();

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { stacks: [makeStack('s1', 'my-chain', 'Deployed')] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { integrations: [makeIntegration('i1', 'bridge', 'Completed')] } }),
      });
    await watcher.poll(makeGetToken('token'));

    expect(mockNotificationShow).toHaveBeenCalledTimes(1);
    expect(MockNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Service Deployment Complete' }),
    );
  });

  // DW-06: No token → poll is skipped
  it('DW-06: skips poll when token is null', async () => {
    await watcher.poll(makeGetToken(null));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockNotificationShow).not.toHaveBeenCalled();
  });

  // DW-07: API error → no crash, no notification
  it('DW-07: API fetch error does not crash and fires no notification', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network error'));

    await expect(watcher.poll(makeGetToken('token'))).resolves.not.toThrow();
    expect(mockNotificationShow).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npx vitest run tests/unit/deployment-watcher.test.ts
```

Expected: FAIL (DeploymentWatcher not found)

- [ ] **Step 3: `deployment-watcher.ts` 구현**

`src/main/deployment-watcher.ts` 파일을 생성:

```typescript
/**
 * deployment-watcher.ts
 *
 * Polls the backend API every DEPLOYMENT_POLL_INTERVAL_MS to detect
 * stack/integration status transitions and fires OS + in-app notifications.
 *
 * Lifecycle:
 *   start(getToken) — begins polling after platform is ready
 *   stop()          — clears interval on app quit
 *   poll(getToken)  — public for testing; one poll cycle
 */

import { Notification } from 'electron';
import * as NotificationStore from './notifications';

const DEPLOYMENT_POLL_INTERVAL_MS = 10_000;

type StackStatus =
  | 'Deploying'
  | 'Updating'
  | 'Deployed'
  | 'FailedToDeploy'
  | 'FailedToUpdate'
  | 'Idle'
  | string;

interface StackEntry {
  id: string;
  name: string;
  status: StackStatus;
}

interface IntegrationEntry {
  id: string;
  type: string;
  status: string;
}

export class DeploymentWatcher {
  private readonly backendUrl: string;
  private previousStackStates = new Map<string, StackStatus>();
  private previousIntegrationStates = new Map<string, string>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(backendUrl: string) {
    this.backendUrl = backendUrl;
  }

  /** Start polling. getToken is called on every cycle to get a fresh token. */
  start(getToken: () => string | null): void {
    if (this.intervalHandle !== null) return; // already running
    this.intervalHandle = setInterval(() => {
      void this.poll(getToken);
    }, DEPLOYMENT_POLL_INTERVAL_MS);
  }

  /** Stop polling. Safe to call multiple times. */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * One poll cycle. Exported for unit testing.
   * Skips silently if token is null or if any fetch fails.
   */
  async poll(getToken: () => string | null): Promise<void> {
    const token = getToken();
    if (!token) return;

    try {
      const stacks = await this.fetchStacks(token);
      for (const stack of stacks) {
        const prev = this.previousStackStates.get(stack.id);
        this.detectStackTransition(stack, prev);
        this.previousStackStates.set(stack.id, stack.status);

        const integrations = await this.fetchIntegrations(stack.id, token);
        for (const integration of integrations) {
          const prevInteg = this.previousIntegrationStates.get(integration.id);
          this.detectIntegrationTransition(integration, prevInteg);
          this.previousIntegrationStates.set(integration.id, integration.status);
        }
      }
    } catch {
      // Network error or unexpected response — skip this cycle silently
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchStacks(token: string): Promise<StackEntry[]> {
    const resp = await fetch(`${this.backendUrl}/api/v1/stacks/thanos`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return [];
    const body = await resp.json() as Record<string, unknown>;
    const data = (body.data ?? body) as Record<string, unknown>;
    const stacks = (data.stacks ?? []) as StackEntry[];
    return stacks;
  }

  private async fetchIntegrations(stackId: string, token: string): Promise<IntegrationEntry[]> {
    try {
      const resp = await fetch(
        `${this.backendUrl}/api/v1/stacks/thanos/${stackId}/integrations`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!resp.ok) return [];
      const body = await resp.json() as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      return (data.integrations ?? []) as IntegrationEntry[];
    } catch {
      return [];
    }
  }

  private detectStackTransition(stack: StackEntry, prevStatus: StackStatus | undefined): void {
    if (prevStatus === undefined) return; // initial snapshot — no notification

    const wasInProgress = prevStatus === 'Deploying' || prevStatus === 'Updating';
    if (!wasInProgress) return;

    if (stack.status === 'Deployed') {
      this.fire(
        'L2 Deployment Complete',
        `"${stack.name}" is now deployed and running.`,
      );
    } else if (stack.status === 'FailedToDeploy' || stack.status === 'FailedToUpdate') {
      this.fire(
        'L2 Deployment Failed',
        `"${stack.name}" deployment failed. Check the dashboard for details.`,
      );
    }
  }

  private detectIntegrationTransition(
    integration: IntegrationEntry,
    prevStatus: string | undefined,
  ): void {
    if (prevStatus === undefined) return; // initial snapshot
    if (prevStatus !== 'InProgress') return;

    if (integration.status === 'Completed') {
      this.fire(
        'Service Deployment Complete',
        `"${integration.type}" service is now running.`,
      );
    } else if (integration.status === 'Failed') {
      this.fire(
        'Service Deployment Failed',
        `"${integration.type}" service deployment failed.`,
      );
    }
  }

  private fire(title: string, body: string): void {
    // In-app notification (always)
    NotificationStore.add({ type: 'deployment', title, message: body });

    // OS desktop notification (if supported)
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  }
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
npx vitest run tests/unit/deployment-watcher.test.ts
```

Expected: 7 tests passed

- [ ] **Step 5: 전체 유닛 테스트 실행 — 회귀 없음 확인**

```bash
npx vitest run tests/unit/
```

Expected: 모든 테스트 통과

- [ ] **Step 6: 커밋**

```bash
git add src/main/deployment-watcher.ts tests/unit/deployment-watcher.test.ts
git commit -m "feat(deployment-watcher): poll backend API and fire OS+in-app notifications on deploy"
```

---

## Task 4: `index.ts`에 watcher 연결

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: import 추가**

`index.ts` 상단의 import 블록 끝부분(예: `from './notifications'` 임포트 아래)에 추가:

```typescript
import { DeploymentWatcher } from './deployment-watcher';
import { getCachedAuthToken } from './webview';
```

- [ ] **Step 2: watcher 인스턴스 선언**

파일 상단의 모듈 수준 변수 선언부(예: `let isQuitting = false;` 근처)에 추가:

```typescript
const deploymentWatcher = new DeploymentWatcher('http://localhost:8000');
```

- [ ] **Step 3: 플랫폼 준비 완료 후 watcher 시작**

`ipcMain.handle('app:load-platform', ...)` 핸들러 안에서 `await showPlatformView(mainWindow)` 호출 직후에 추가:

```typescript
await showPlatformView(mainWindow);
deploymentWatcher.start(() => getCachedAuthToken());
return;
```

(`return;`은 이미 있는 코드이므로 `deploymentWatcher.start(...)` 한 줄만 삽입한다.)

- [ ] **Step 4: 앱 종료 시 watcher 정지**

`app.on('before-quit', ...)` 핸들러 안에서 `clearInterval(updateCheckInterval)` 블록 바로 아래에 추가:

```typescript
deploymentWatcher.stop();
```

- [ ] **Step 5: 타입 체크 + 빌드 통과 확인**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: 커밋**

```bash
git add src/main/index.ts
git commit -m "feat(main): start deployment watcher after platform ready, stop on quit"
```

---

## Task 5: 빌드 검증 + 스펙 파일 포함 최종 커밋

- [ ] **Step 1: 전체 테스트 통과 확인**

```bash
npx vitest run
```

Expected: 모든 유닛 테스트 통과

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Electron 빌드**

```bash
npm run build
```

Expected: `dist/main/index.js` 생성, 에러 없음

- [ ] **Step 4: 스펙 파일 포함 커밋 (git add -f 필요)**

`docs/superpowers/` 는 `.gitignore`에 등록되어 있으므로 `-f` 플래그로 강제 추가한다:

```bash
git add -f docs/superpowers/specs/2026-04-15-desktop-deployment-notification-design.md
git add -f docs/superpowers/plans/2026-04-15-desktop-deployment-notification.md
git commit -m "docs(superpowers): add deployment notification design spec and implementation plan"
```

---

## Self-Review

### Spec Coverage

| 스펙 요구사항 | 담당 Task |
|---|---|
| `deployment-watcher.ts` 신규 생성 | Task 3 |
| `getCachedAuthToken()` export | Task 2 |
| `index.ts` watcher 연결 (start/stop) | Task 4 |
| `AppNotification.type` `'deployment'` 추가 | Task 1 |
| Stack `Deploying/Updating → Deployed` → Success 알림 | Task 3 (DW-02) |
| Stack `Deploying/Updating → FailedToDeploy/FailedToUpdate` → Failure 알림 | Task 3 (DW-03) |
| Integration `InProgress → Completed` → Service 알림 | Task 3 (DW-05) |
| Integration `InProgress → Failed` → Service Failure 알림 | Task 3 (코드 포함, 테스트 DW-05 변형) |
| 초기 스냅샷 시 알림 미발송 | Task 3 (DW-01) |
| 토큰 없으면 폴링 스킵 | Task 3 (DW-06) |
| API 오류 시 조용히 스킵 | Task 3 (DW-07) |
| `Notification.isSupported()` false 시 OS 알림 생략 | Task 3 (fire() 메서드) |
| OS 알림 + 인앱 알림 동시 발송 | Task 3 (fire() 메서드) |
| 스펙+플랜 파일 커밋 | Task 5 |

### Placeholder Scan

없음 — 모든 스텝에 실제 코드 포함.

### Type Consistency

- `DeploymentWatcher` — Task 3에서 정의, Task 4에서 import
- `getCachedAuthToken()` — Task 2에서 export, Task 4에서 import
- `NotificationStore.add()` 의 `type: 'deployment'` — Task 1에서 유니온 확장 후 Task 3에서 사용
- `AppNotification` — `notifications.ts`와 `types.ts` 두 파일 모두 Task 1에서 동기화
