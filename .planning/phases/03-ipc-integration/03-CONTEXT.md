# Phase 3: IPC Integration - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Electron IPC 채널명 일치 검증, keystore/Docker IPC payload Zod 검증, Backend API contract 검증, WebView credential injection 형태 검증. 실제 Electron 앱 실행 없이 정적 분석 + mock 기반으로 로직 정합성만 확인.

</domain>

<decisions>
## Implementation Decisions

### Channel Registry (IPC-01)
- **D-01:** preload.ts를 `readFileSync`로 읽어 정규식으로 `ipcRenderer.invoke('채널명')` 패턴을 추출한다. index.ts는 `ipcMain.handle('채널명', ...)` 패턴을 추출한다. 두 집합을 비교하여 일치 여부 검증.
- **D-02:** Phase 2 main.tf 정규식 파싱 패턴과 동일한 접근법. HCL 파서 불필요했듯 AST 파서도 불필요 — 정규식으로 충분.

### IPC Payload Validation (IPC-02, IPC-03)
- **D-03:** keystore IPC payload(setSeedPhrase, getAccounts 등)와 Docker IPC payload(docker:status, docker:start 등)를 Zod 스키마로 정의하고 실제 호출 형태를 검증한다.
- **D-04:** vi.mock('electron') 패턴으로 ipcRenderer/ipcMain을 mock. Phase 1의 vi.mock 패턴과 동일.

### Backend API Contract (IPC-04)
- **D-05:** POST /preset-deploy 요청/응답 스키마를 Zod로 정의하고 검증한다. 실제 HTTP 요청 없이 payload 구조만 검증.
- **D-06:** vi.mock + fetch mock 방식 사용 (msw 불필요 — 구조 검증만 필요하므로 인터셉션 라이브러리 오버킬).

### WebView Injection Validation (IPC-05)
- **D-07:** `window.__TRH_DESKTOP_ACCOUNTS__`와 `window.__TRH_AWS_CREDENTIALS__` payload 구조를 Zod 스키마로 정의하고 검증한다.
- **D-08:** webview.ts의 payload 생성 로직을 순수 함수로 추출하거나, executeJavaScript 호출 인자를 정규식으로 추출하여 JSON.parse 후 Zod 검증.

### Test File Structure
- **D-09:** 3개 분리된 테스트 파일:
  - `tests/unit/ipc-channels.test.ts` — IPC-01: 채널 레지스트리 일치 검증
  - `tests/unit/ipc-payloads.test.ts` — IPC-02, IPC-03: keystore/Docker payload Zod 검증
  - `tests/unit/webview-injection.test.ts` — IPC-04, IPC-05: Backend API contract + WebView injection 검증

### Claude's Discretion
- 채널 레지스트리 정규식 패턴 세부 구현
- IPC payload Zod 스키마 필드 구조
- Backend API contract 스키마 상세 정의 (trh-backend API 코드 참조)
- WebView injection payload export/추출 방식

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### IPC Definitions
- `src/main/preload.ts` — ipcRenderer.invoke 채널명 전체 목록 (IPC-01 검증 대상)
- `src/main/index.ts` — ipcMain.handle 채널명 전체 목록 (IPC-01 검증 대상)

### WebView Injection
- `src/main/webview.ts` — injectKeystoreAccounts(), injectAwsCredentials() 함수 (IPC-05 검증 대상)

### Backend API
- `../../trh-backend/pkg/api/` — Backend API endpoint 정의 (IPC-04 contract 참조)

### Phase 1/2 Patterns (재사용)
- `tests/schemas/preset.schema.ts` — Zod 스키마 패턴
- `tests/unit/deploy-aws.test.ts` — 정규식 기반 정적 파싱 패턴 (DTGT-04)
- `tests/unit/deploy-local.test.ts` — vi.mock + child_process 패턴
- `vitest.config.mts` — Vitest 설정

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/schemas/` — Phase 1/2에서 확립된 Zod 스키마 패턴, IPC payload 스키마도 동일 구조로 작성
- `tests/helpers/` — fixture 로딩 및 YAML 파싱 헬퍼

### Established Patterns
- vi.mock('electron'), vi.mock('child_process') 패턴으로 Electron 의존성 우회
- 정규식으로 소스 파일 정적 분석 (Phase 2 DTGT-04에서 검증됨)
- Zod schema.parse()로 payload 구조 검증
- describe/it BDD 구조

### Integration Points
- preload.ts ↔ index.ts 채널명 일치
- webview.ts의 executeJavaScript 인자 → JSON.parse → Zod 검증
- Backend API POST /preset-deploy payload 구조

</code_context>

<specifics>
## Specific Ideas

- 채널 레지스트리: `readFileSync('src/main/preload.ts')` → `/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g` 정규식으로 채널 추출
- index.ts: `/ipcMain\.handle\(['"]([^'"]+)['"]/g` 정규식으로 handler 추출
- 두 집합 비교: preload에 있는 모든 채널이 index에도 있는지 검증
- WebView injection: webview.ts에서 payload 생성 부분을 순수 함수로 추출하거나, executeJavaScript 호출 문자열에서 JSON 추출
- Backend API: POST /preset-deploy 요청 body에 presetId, networkType, config 등이 있는지 Zod 검증

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-ipc-integration*
*Context gathered: 2026-03-27*
