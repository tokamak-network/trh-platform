# Phase 3: IPC Integration - Research

**Researched:** 2026-03-27
**Domain:** Electron IPC channel verification, payload schema validation, WebView injection testing
**Confidence:** HIGH

## Summary

Phase 3은 Electron IPC 채널의 정합성을 정적 분석 + Zod 스키마 기반으로 검증하는 테스트를 작성하는 단계이다. 실제 Electron 런타임 없이 소스 파일을 `readFileSync`로 읽어 정규식으로 채널명을 추출하고, payload 구조를 Zod 스키마로 검증하는 접근법이다.

소스 코드 분석 결과, IPC 채널은 3개 파일에 분산되어 있다: `preload.ts`(main window renderer용 38개 invoke + 11개 on 채널), `webview-preload.ts`(WebView용 8개 invoke 채널), `index.ts`(42개 handle), `webview.ts`(8개 handle). 채널 레지스트리 테스트에서는 preload.ts의 invoke 채널과 index.ts+webview.ts의 handle 채널 간 1:1 매칭을 검증해야 한다. 추가로 webview-preload.ts의 invoke 채널도 handle 측과 매칭되는지 검증이 필요하다.

Backend API contract은 Go 구조체 `PresetDeployRequest`(trh-backend/pkg/api/dtos/thanos.go)에 정의되어 있으며, 엔드포인트는 `POST /stacks/thanos/preset-deploy`이다. WebView injection은 `window.__TRH_DESKTOP_ACCOUNTS__`와 `window.__TRH_AWS_CREDENTIALS__` 두 개의 전역 변수를 사용하며, payload 구조가 webview.ts의 `injectKeystoreAccounts()`와 `injectAwsCredentials()` 함수에 정의되어 있다.

**Primary recommendation:** Phase 2의 정규식 정적 파싱 패턴을 재사용하여 IPC 채널 추출, Phase 1의 Zod 스키마 패턴을 재사용하여 payload 구조 검증. 3개 테스트 파일로 분리.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: preload.ts를 readFileSync로 읽어 정규식으로 ipcRenderer.invoke('채널명') 패턴 추출. index.ts는 ipcMain.handle('채널명', ...) 패턴 추출. 두 집합 비교하여 일치 여부 검증.
- D-02: Phase 2 main.tf 정규식 파싱 패턴과 동일한 접근법. AST 파서 불필요.
- D-03: keystore IPC payload와 Docker IPC payload를 Zod 스키마로 정의하고 검증.
- D-04: vi.mock('electron') 패턴으로 ipcRenderer/ipcMain mock.
- D-05: POST /preset-deploy 요청/응답 스키마를 Zod로 정의하고 검증. 실제 HTTP 요청 없이 payload 구조만 검증.
- D-06: vi.mock + fetch mock 방식 사용 (msw 불필요).
- D-07: window.__TRH_DESKTOP_ACCOUNTS__와 window.__TRH_AWS_CREDENTIALS__ payload 구조를 Zod 스키마로 정의하고 검증.
- D-08: webview.ts의 payload 생성 로직을 순수 함수로 추출하거나, executeJavaScript 호출 인자를 정규식으로 추출하여 JSON.parse 후 Zod 검증.
- D-09: 3개 테스트 파일 분리: ipc-channels.test.ts, ipc-payloads.test.ts, webview-injection.test.ts

### Claude's Discretion
- 채널 레지스트리 정규식 패턴 세부 구현
- IPC payload Zod 스키마 필드 구조
- Backend API contract 스키마 상세 정의 (trh-backend API 코드 참조)
- WebView injection payload export/추출 방식

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IPC-01 | Electron IPC 채널명이 main/renderer 간 일치하는지 검증 (채널 레지스트리 기반) | 전체 채널 인벤토리 완료 (아래 Architecture Patterns 참조). preload.ts invoke 38개 + webview-preload.ts invoke 8개 vs index.ts handle 42개 + webview.ts handle 8개. 정규식 패턴 확정. |
| IPC-02 | keystore 관련 IPC payload 형태 검증 | keystore.ts 분석 완료. 7개 채널의 input/output 타입 확인: store(string)->void, has()->boolean, isAvailable()->boolean, getAddresses()->Record<KeyRole,string>, previewAddresses(string)->Record<KeyRole,string>, delete()->void, validate(string)->boolean |
| IPC-03 | Docker 관련 IPC payload 형태 검증 | preload.ts의 DockerStatus, PullProgress, PortCheckResult, BackendDependencies 인터페이스 확인. 18개 docker:* invoke 채널의 input/output 타입 매핑 완료. |
| IPC-04 | Backend API contract (POST /preset-deploy) 요청/응답 스키마 검증 | Go 구조체 PresetDeployRequest 필드 확인 완료: presetId, chainName, network, seedPhrase, infraProvider, awsAccessKey, awsSecretKey, awsRegion, l1RpcUrl, l1BeaconUrl, feeToken, reuseDeployment, overrides. 엔드포인트: POST /stacks/thanos/preset-deploy |
| IPC-05 | WebView credential injection 형태 검증 | webview.ts의 injectKeystoreAccounts()와 injectAwsCredentials() 분석 완료. payload 구조 확정. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.1.0 | Test runner | 프로젝트 기존 설정 |
| zod | (installed) | Payload schema validation | Phase 1에서 확립된 패턴 |
| fs (built-in) | - | 소스 파일 읽기 (readFileSync) | 정적 분석용 |

### Supporting
없음. 추가 라이브러리 불필요. 기존 프로젝트 의존성만으로 충분.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 정규식 파싱 | TypeScript AST (ts-morph) | 오버킬. 채널명은 단순 문자열 리터럴이므로 정규식으로 충분 |
| vi.mock + fetch mock | msw | 오버킬. HTTP 인터셉션 불필요, payload 구조만 검증 |

## Architecture Patterns

### IPC Channel Complete Inventory

소스 코드 정적 분석 결과, 다음과 같은 채널 구조가 확인됨.

#### preload.ts invoke 채널 (main window renderer -> main process)

**docker:** (18개)
- `docker:check-installed`, `docker:check-running`, `docker:get-status`, `docker:check-ports`
- `docker:kill-port-processes`, `docker:cleanup`, `docker:start-daemon`, `docker:prune`
- `docker:check-updates`, `docker:restart-with-updates`, `docker:pull-images`
- `docker:start`, `docker:stop`, `docker:wait-healthy`
- `docker:get-install-url`, `docker:install-docker`
- `docker:check-backend-deps`, `docker:install-backend-deps`

**app:** (3개)
- `app:load-platform`, `app:open-external`, `app:get-version`

**notifications:** (6개)
- `notifications:get-all`, `notifications:mark-read`, `notifications:mark-all-read`
- `notifications:dismiss`, `notifications:execute-action`, `notifications:get-unread-count`

**webview:** (6개)
- `webview:go-back`, `webview:go-forward`, `webview:reload`
- `webview:load-url`, `webview:show`, `webview:hide`

**keystore:** (7개)
- `keystore:store`, `keystore:has`, `keystore:is-available`
- `keystore:get-addresses`, `keystore:preview-addresses`
- `keystore:delete`, `keystore:validate`

**aws-auth:** (9개)
- `aws-auth:list-profiles`, `aws-auth:load-profile`, `aws-auth:sso-login`
- `aws-auth:sso-login-direct`, `aws-auth:sso-list-accounts`, `aws-auth:sso-list-roles`
- `aws-auth:sso-assume-role`, `aws-auth:get-credentials`, `aws-auth:clear`

**network-guard:** (1개)
- `network-guard:get-blocked`

**Total invoke in preload.ts: 50개** (non-event channels only, excluding `.on` listeners)

#### preload.ts on 채널 (main -> renderer events, 단방향)

- `docker:pull-progress`, `docker:status-update`, `docker:install-progress`, `docker:log`, `docker:update-available`
- `notifications:changed`
- `webview:visibility-changed`, `webview:did-navigate`, `webview:did-finish-load`, `webview:load-failed`

**Total on in preload.ts: 10개** (event listener channels)

#### webview-preload.ts invoke 채널 (webview -> main process)

- `aws-auth:sso-login-direct`, `aws-auth:sso-list-accounts`, `aws-auth:sso-list-roles`
- `aws-auth:sso-assume-role`, `aws-auth:get-credentials`, `aws-auth:clear`
- `desktop:fetch-balances`, `desktop:get-seed-words`

**Total invoke in webview-preload.ts: 8개** (이 중 6개는 preload.ts와 중복 채널)

#### index.ts + webview.ts handle 채널 (main process handlers)

**index.ts:** 42개 handle
**webview.ts:** 8개 handle (`webview:go-back`, `webview:go-forward`, `webview:reload`, `webview:load-url`, `webview:show`, `webview:hide`, `desktop:get-seed-words`, `desktop:fetch-balances`)

**Total handle: 50개** (정확히 preload.ts의 50개 invoke + webview-preload.ts 전용 2개 = 총 52개이나, webview-preload.ts의 6개 aws-auth 채널은 preload.ts와 동일하고 index.ts에서 이미 등록됨)

#### Channel Matching Analysis

preload.ts invoke 채널 50개는 index.ts(42개) + webview.ts(8개) = 50개 handle과 1:1 매핑됨.
webview-preload.ts invoke 채널 8개 중:
- 6개 (`aws-auth:*`)는 index.ts에서 이미 handle 등록됨
- 2개 (`desktop:fetch-balances`, `desktop:get-seed-words`)는 webview.ts에서 handle 등록됨

**결론:** 모든 invoke 채널에 대응하는 handle이 존재함. 테스트는 이 매핑을 자동으로 검증해야 함.

### Regex Patterns for Channel Extraction

```typescript
// preload.ts / webview-preload.ts에서 invoke 채널 추출
const invokeRegex = /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g;

// index.ts / webview.ts에서 handle 채널 추출
const handleRegex = /ipcMain\.handle\(['"]([^'"]+)['"]/g;

// preload.ts에서 on 이벤트 채널 추출 (send 채널과 매칭 검증용)
const onRegex = /ipcRenderer\.on\(['"]([^'"]+)['"]/g;
```

### WebView Injection Payload Structures

```typescript
// window.__TRH_DESKTOP_ACCOUNTS__ (from injectKeystoreAccounts)
// Source: src/main/webview.ts lines 197-203
const accountsPayload = {
  admin: { address: string, privateKey: string },
  proposer: { address: string, privateKey: string },
  batcher: { address: string, privateKey: string },
  challenger: { address: string, privateKey: string },
  sequencer: { address: string, privateKey: string },
};

// window.__TRH_AWS_CREDENTIALS__ (from injectAwsCredentials)
// Source: src/main/webview.ts lines 365-370
const awsPayload = {
  accessKeyId: string,
  secretAccessKey: string,
  sessionToken: string | undefined,
  source: string,
};
```

### Backend API Contract (POST /stacks/thanos/preset-deploy)

```typescript
// Source: trh-backend/pkg/api/dtos/thanos.go PresetDeployRequest
const presetDeployRequestSchema = z.object({
  presetId: z.string(),
  chainName: z.string(),
  network: z.enum(['Mainnet', 'Testnet', 'LocalDevnet']),
  seedPhrase: z.string(),
  infraProvider: z.enum(['aws', 'local']),
  awsAccessKey: z.string().optional(),
  awsSecretKey: z.string().optional(),
  awsRegion: z.string().optional(),
  l1RpcUrl: z.string(),
  l1BeaconUrl: z.string(),
  feeToken: z.string().optional(),
  reuseDeployment: z.boolean().optional(),
  overrides: z.array(z.object({
    field: z.string(),
    value: z.any(),
  })).optional(),
});
```

### Recommended Test File Structure

```
tests/
  schemas/
    preset.schema.ts          # (existing, Phase 1)
    ipc.schema.ts             # NEW: IPC payload Zod schemas
    api-contract.schema.ts    # NEW: Backend API contract Zod schemas
    webview.schema.ts         # NEW: WebView injection payload Zod schemas
  unit/
    ipc-channels.test.ts      # IPC-01: Channel registry matching
    ipc-payloads.test.ts      # IPC-02, IPC-03: Keystore/Docker payload validation
    webview-injection.test.ts  # IPC-04, IPC-05: API contract + WebView injection
```

### Pattern: Static File Regex Parsing (Phase 2 재사용)

```typescript
// Source: deploy-aws.test.ts (DTGT-04) established pattern
import { readFileSync } from 'fs';
import { join } from 'path';

// Read source file and extract channels
const preloadSrc = readFileSync(
  join(__dirname, '..', '..', 'src', 'main', 'preload.ts'),
  'utf-8'
);
const invokeChannels = new Set<string>();
let match;
const regex = /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g;
while ((match = regex.exec(preloadSrc)) !== null) {
  invokeChannels.add(match[1]);
}
```

### Pattern: WebView Injection Extraction

webview.ts의 `injectKeystoreAccounts()`와 `injectAwsCredentials()` 함수는 `executeJavaScript`에 전달하는 문자열 내에 `JSON.stringify(payload)`를 사용한다. 테스트 접근법 두 가지:

**Option A (권장):** webview.ts를 readFileSync로 읽어 payload 생성 코드 블록을 정규식으로 추출하고, payload 객체의 필드 구조를 검증.

```typescript
// executeJavaScript에서 window.__TRH_DESKTOP_ACCOUNTS__ 할당 패턴 확인
const webviewSrc = readFileSync(join(..., 'webview.ts'), 'utf-8');
// payload 객체 필드명 추출
const accountFields = /payload\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s;
```

**Option B:** Zod 스키마로 기대 구조를 정의하고, 소스 코드에서 payload 키 목록이 스키마 키 목록과 일치하는지 정규식으로 검증.

### Anti-Patterns to Avoid
- **Electron 런타임 의존:** 실제 `ipcMain.handle()` 호출 테스트 시도. 이 phase는 정적 분석이 목적.
- **실제 HTTP 요청:** Backend API contract은 구조 검증만. fetch mock으로 충분.
- **AST 파서 도입:** ts-morph 등은 오버킬. 정규식으로 채널명 문자열 리터럴 추출이 충분.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation | 수동 타입 체크 로직 | Zod schema.parse() | 에러 메시지 자동 생성, 타입 추론 |
| Channel extraction | 수동 채널 목록 하드코딩 | readFileSync + regex | 소스 변경 시 자동 감지 |

## Common Pitfalls

### Pitfall 1: Regex Escaping for Colons in Channel Names
**What goes wrong:** 채널명에 콜론(:)이 포함됨 (예: `docker:check-installed`). 정규식에서 콜론은 특수문자가 아니지만, 부적절한 문자 클래스 사용 시 누락 가능.
**How to avoid:** `[^'"]+` 패턴은 콜론을 포함하므로 안전. 테스트에서 추출된 채널 수를 known count와 비교하여 검증.

### Pitfall 2: webview.ts의 Handle 채널 누락
**What goes wrong:** index.ts만 검사하고 webview.ts의 `registerWebviewIpcHandlers()` 내 8개 handle을 누락.
**How to avoid:** handle 추출 시 index.ts와 webview.ts 두 파일 모두 스캔. 특히 `desktop:get-seed-words`와 `desktop:fetch-balances`는 webview.ts에만 존재.

### Pitfall 3: webview-preload.ts와 preload.ts의 중복 채널
**What goes wrong:** webview-preload.ts의 invoke 채널을 preload.ts와 별도로 카운트하면 중복으로 인한 불일치.
**How to avoid:** 채널 집합(Set)으로 중복 제거 후 비교하거나, 두 preload 파일을 개별적으로 검증. CONTEXT.md의 D-01은 preload.ts와 index.ts 비교를 명시하므로, webview-preload.ts는 별도 테스트 케이스로 분리 가능.

### Pitfall 4: ipcRenderer.on vs ipcRenderer.invoke 혼동
**What goes wrong:** preload.ts에는 `.invoke()` (request-response)와 `.on()` (event listener) 두 가지 패턴이 있음. `.on()` 채널은 main에서 `.send()`로 보내는 이벤트이므로 `.handle()` 채널 목록에는 없음.
**How to avoid:** invoke 채널과 on 채널을 별도 정규식으로 추출. handle 매칭은 invoke 채널에 대해서만 수행. on 채널은 main 프로세스의 `.send()` 호출과 매칭 검증 가능(선택적).

### Pitfall 5: Backend API Contract의 Go 타입 -> TypeScript 변환
**What goes wrong:** Go의 `entities.DeploymentNetwork`는 string enum이고 값은 `"Mainnet"`, `"Testnet"`, `"LocalDevnet"`. 대소문자를 틀리면 Zod enum 불일치.
**How to avoid:** Go 소스에서 정확한 enum 값을 확인하고 Zod schema에 반영. `binding:"required"` 태그가 있는 필드만 required로, 나머지는 optional.

## Code Examples

### Channel Registry Test Pattern
```typescript
// Source: established pattern from deploy-aws.test.ts (readFileSync + regex)
import { readFileSync } from 'fs';
import { join } from 'path';

function extractChannels(filePath: string, regex: RegExp): Set<string> {
  const src = readFileSync(filePath, 'utf-8');
  const channels = new Set<string>();
  let match;
  while ((match = regex.exec(src)) !== null) {
    channels.add(match[1]);
  }
  return channels;
}

describe('IPC Channel Registry', () => {
  it('IPC-01: all preload invoke channels have matching main handlers', () => {
    const preloadPath = join(__dirname, '..', '..', 'src', 'main', 'preload.ts');
    const indexPath = join(__dirname, '..', '..', 'src', 'main', 'index.ts');
    const webviewPath = join(__dirname, '..', '..', 'src', 'main', 'webview.ts');

    const invokeChannels = extractChannels(preloadPath, /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g);
    const handleChannelsIndex = extractChannels(indexPath, /ipcMain\.handle\(['"]([^'"]+)['"]/g);
    const handleChannelsWebview = extractChannels(webviewPath, /ipcMain\.handle\(['"]([^'"]+)['"]/g);
    const allHandleChannels = new Set([...handleChannelsIndex, ...handleChannelsWebview]);

    for (const channel of invokeChannels) {
      expect(allHandleChannels.has(channel)).toBe(true);
    }
  });
});
```

### IPC Payload Zod Schema Pattern
```typescript
// Source: preset.schema.ts established Zod pattern
import { z } from 'zod';

// Keystore IPC schemas
export const KeystoreGetAddressesResponseSchema = z.record(
  z.enum(['admin', 'proposer', 'batcher', 'challenger', 'sequencer']),
  z.string().startsWith('0x'),
);

// Docker IPC schemas
export const DockerStatusSchema = z.object({
  installed: z.boolean(),
  running: z.boolean(),
  containersUp: z.boolean(),
  healthy: z.boolean(),
  error: z.string().optional(),
});
```

### WebView Injection Schema Pattern
```typescript
import { z } from 'zod';

export const DesktopAccountsSchema = z.object({
  admin: z.object({ address: z.string(), privateKey: z.string() }),
  proposer: z.object({ address: z.string(), privateKey: z.string() }),
  batcher: z.object({ address: z.string(), privateKey: z.string() }),
  challenger: z.object({ address: z.string(), privateKey: z.string() }),
  sequencer: z.object({ address: z.string(), privateKey: z.string() }),
});

export const AwsCredentialsSchema = z.object({
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  sessionToken: z.string().optional(),
  source: z.string(),
});
```

## Open Questions

1. **on/send 채널 매칭 검증 범위**
   - What we know: preload.ts에 10개의 `.on()` 이벤트 리스너가 있고, main 프로세스에서 `webContents.send()`로 이벤트를 보냄.
   - What's unclear: CONTEXT.md의 D-01은 invoke/handle 매칭만 명시. send/on 매칭까지 검증할지는 미결정.
   - Recommendation: invoke/handle 매칭을 우선 구현하고, send/on 매칭은 별도 테스트 케이스로 추가 (Claude's discretion 범위 내).

2. **Backend API 응답 스키마**
   - What we know: `PresetDeployRequest`는 Go 소스에서 확인됨. 응답은 `entities.Response` 래퍼.
   - What's unclear: 응답 body의 정확한 필드 (generic Response wrapper의 내부 구조).
   - Recommendation: 요청 스키마 검증에 집중하고, 응답은 `{ status: number, data?: any }` 정도의 최소 스키마로 처리.

## Sources

### Primary (HIGH confidence)
- `src/main/preload.ts` - 전체 IPC invoke/on 채널 50+10개 확인
- `src/main/index.ts` - 전체 IPC handle 42개 확인
- `src/main/webview.ts` - IPC handle 8개 + injection payload 구조 확인
- `src/main/webview-preload.ts` - WebView IPC invoke 8개 확인
- `src/main/keystore.ts` - KeyRole 타입, 함수 시그니처 확인
- `src/main/aws-auth.ts` - AwsCredentials 인터페이스 확인
- `trh-backend/pkg/api/dtos/thanos.go` - PresetDeployRequest Go 구조체 확인
- `trh-backend/pkg/api/handlers/thanos/presets.go` - 엔드포인트 라우트 확인
- `tests/unit/deploy-aws.test.ts` - 정규식 정적 파싱 패턴 확인
- `tests/schemas/preset.schema.ts` - Zod 스키마 패턴 확인
- `vitest.config.mts` - 테스트 설정 확인

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 기존 프로젝트 의존성만 사용, 추가 라이브러리 없음
- Architecture: HIGH - 전체 소스 코드 직접 분석, 채널 인벤토리 완성
- Pitfalls: HIGH - 실제 소스 구조에서 발견된 구체적 함정들

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (안정적인 프로젝트 내부 구조 분석)
