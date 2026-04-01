---
phase: quick
plan: 260401-mn3
subsystem: electron-app
tags: [electron, relaunch, tray, ipc, ux]
key-files:
  modified:
    - src/main/index.ts
    - src/main/preload.ts
    - src/renderer/App.tsx
    - src/renderer/types.ts
    - src/renderer/mock/electronAPI.ts
decisions:
  - "types.ts에 별도의 ElectronAPI 타입 정의가 있어 relaunch를 preload.ts 외에 types.ts와 mock/electronAPI.ts 모두에 추가"
metrics:
  duration: "5min"
  completed: "2026-04-01"
  tasks: 2
  files: 5
---

# Quick 260401-mn3: Restart App (Container-Preserving Relaunch) Summary

**One-liner:** Tray + gear 메뉴에 "Restart App" 추가 — isRelaunching 플래그로 stopContainers() skip, 재시작 후 컨테이너 유지 + setup 자동 skip.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | isRelaunching 플래그 + IPC handler + Tray 메뉴 | 20a09b3 | src/main/index.ts |
| 2 | Preload API 노출 + webapp gear 메뉴 Restart App 버튼 | 19948da | src/main/preload.ts, src/renderer/App.tsx, src/renderer/types.ts, src/renderer/mock/electronAPI.ts |

## What Was Built

- `isRelaunching` 모듈 플래그: `before-quit` 핸들러에서 `stopContainers()` 호출을 조건부 skip
- `app:relaunch` IPC handler: 플래그 설정 후 `app.relaunch()` + `app.quit()` 호출
- Tray 메뉴: "Restart Services"와 "Stop Services" 사이에 "Restart App" 항목 추가
- Preload API: `window.electronAPI.app.relaunch()` 노출
- Gear dropdown: "Uninstall" 위에 "Restart App" 버튼 추가
- 재시작 후 setup skip: App.tsx useEffect의 기존 `status.healthy` 체크 로직이 그대로 동작

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] types.ts ElectronAPI app 인터페이스에 relaunch 추가**
- **Found during:** Task 2 컴파일 검증
- **Issue:** renderer process는 preload.ts의 `typeof electronAPI` 타입이 아닌 `src/renderer/types.ts`의 `ElectronAPI` 인터페이스를 사용함. `relaunch` 미정의 시 TS2339 에러
- **Fix:** `types.ts` app 인터페이스에 `relaunch: () => Promise<void>` 추가
- **Files modified:** src/renderer/types.ts

**2. [Rule 2 - Missing] mock/electronAPI.ts app 객체에 relaunch 추가**
- **Found during:** Task 2 컴파일 검증 (TS2741 missing property)
- **Issue:** 브라우저 mock 모드의 app 객체가 ElectronAPI 인터페이스를 구현해야 하므로 relaunch stub 필요
- **Fix:** `mock/electronAPI.ts` app 객체에 `relaunch: async () => console.log('[mock] App relaunch requested')` 추가
- **Files modified:** src/renderer/mock/electronAPI.ts

### Pre-existing Issues (Out of Scope)

`SetupPage.test.tsx`의 `toBeInTheDocument` / `toBeDisabled` TS2339 에러 19개는 이번 변경과 무관한 기존 에러 (`@testing-library/jest-dom` 타입 선언 누락). `deferred-items.md`에 기록.

## Known Stubs

None — 모든 기능이 실제 IPC 호출로 연결됨.

## Self-Check: PASSED

- src/main/index.ts: isRelaunching 플래그, app:relaunch 핸들러, Tray "Restart App" 확인
- src/main/preload.ts: app.relaunch() 노출 확인
- src/renderer/App.tsx: gear dropdown "Restart App" 버튼 확인
- src/renderer/types.ts: ElectronAPI.app.relaunch 타입 확인
- Commit 20a09b3: found
- Commit 19948da: found
