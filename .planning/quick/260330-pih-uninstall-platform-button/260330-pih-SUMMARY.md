---
id: 260330-pih
title: Add "Uninstall Platform" button to Electron app
phase: quick
plan: 260330-pih
subsystem: electron-ui
tags: [docker, ipc, ui, uninstall]
completed: 2026-03-30
duration: ~10min
tasks_completed: 4
files_changed: 4
---

# Quick Plan 260330-pih: Uninstall Platform Button Summary

**One-liner:** Gear settings button with dropdown and UNINSTALL confirmation modal wired to `docker compose down --volumes` via new `cleanPlatform` IPC endpoint.

## What Was Implemented

Webapp overlay (`viewMode='webapp'`)에 기어 아이콘 버튼을 추가했다. 버튼 클릭 시 버전 정보와 빨간 Uninstall 버튼이 담긴 드롭다운이 나타나고, Uninstall 버튼을 누르면 "UNINSTALL" 입력 확인 모달이 열린다. 입력 일치 시 `docker compose down --volumes --remove-orphans`를 실행한 뒤 ConfigPage로 복귀한다.

### Implementation Flow

1. **`docker.ts`** — `cleanPlatform()` 함수 추가: `docker compose down --volumes --remove-orphans` 실행, 60초 타임아웃 후 resolve(reject 아닌 resolve로 ConfigPage 복귀 보장)

2. **`index.ts`** — `docker:clean-platform` IPC 핸들러 등록: `dockerOperationInProgress` mutex로 동시 실행 방지, try/finally로 mutex 해제 보장

3. **`preload.ts`** — `window.electronAPI.docker.cleanPlatform()` API 노출

4. **`App.tsx` + `App.css`** — webapp case에 기어 버튼/드롭다운/확인 모달 추가:
   - `gearOpen`, `uninstallOpen`, `uninstallInput`, `uninstalling` state 4개 추가
   - `handleUninstall()` 핸들러: IPC 호출 → 성공/실패 무관하게 ConfigPage 복귀
   - 드롭다운 외부 클릭 시 닫히는 backdrop overlay
   - 다크 테마 모달 UI 스타일

## Files Changed

| File | Change |
|------|--------|
| `src/main/docker.ts` | `cleanPlatform()` 함수 추가 (export) |
| `src/main/index.ts` | `cleanPlatform` import 추가, `docker:clean-platform` IPC 핸들러 등록 |
| `src/main/preload.ts` | `docker.cleanPlatform` API 노출 |
| `src/renderer/App.tsx` | state 4개, `handleUninstall` 핸들러, webapp case 확장 |
| `src/renderer/App.css` | 기어 메뉴 + 언인스톨 모달 스타일 추가 |

## Commits

| Hash | Message |
|------|---------|
| 458ff47 | feat(quick-260330-pih): add cleanPlatform() function to docker.ts |
| a0e6819 | feat(quick-260330-pih): register docker:clean-platform IPC handler in index.ts |
| 08d0267 | feat(quick-260330-pih): expose cleanPlatform in preload.ts |
| 1bb0457 | feat(quick-260330-pih): add gear menu, dropdown, and uninstall modal to webapp view |

## Deviations from Plan

None - 플랜에 명시된 대로 정확히 구현되었다.

## Self-Check: PASSED

- `src/main/docker.ts` — cleanPlatform export 존재 확인
- `src/main/index.ts` — docker:clean-platform 핸들러 등록 확인
- `src/main/preload.ts` — cleanPlatform API 노출 확인
- `src/renderer/App.tsx` — gear menu + uninstall modal 구현 확인
- `npx tsc --noEmit` — 에러 없이 통과
- 커밋 458ff47, a0e6819, 08d0267, 1bb0457 모두 존재
