# Desktop Deployment Notification Design

**Date:** 2026-04-15
**Status:** Approved

## Overview

Electron app에서 L2 체인 배포 완료 및 서비스(인테그레이션) 배포 완료 시 macOS/Windows/Linux 데스크탑 OS 알림을 발송한다. 사용자가 앱 밖에서 다른 작업 중일 때도 배포 완료를 인지할 수 있다.

## Architecture

### Approach: Backend API Polling (Single-Repo)

`trh-platform` 단일 레포 변경만으로 구현한다. Electron 메인 프로세스가 `http://localhost:8000/api/v1` 백엔드를 10초 간격으로 폴링하여 스택/인테그레이션 상태 전환을 감지하고 OS 알림을 발송한다.

**기각한 대안:** webview bridge(`window.__TRH_DESKTOP__`) 방식은 `trh-platform-ui` Docker 이미지도 수정해야 하므로 두 레포 변경이 필요 → 폴링 방식이 더 단순.

### New File: `src/main/deployment-watcher.ts`

배포 감시 전담 모듈. 단일 책임: 상태 전환 감지 → OS 알림 발송.

```
DeploymentWatcher
├── previousStackStates: Map<stackId, StackStatus>
├── previousIntegrationStates: Map<integrationId, string>
├── start(getToken: () => string | null): void
└── stop(): void
```

**폴링 흐름:**
1. `GET /api/v1/stacks/thanos` — 전체 스택 목록 조회
2. 각 스택에 대해 `GET /api/v1/stacks/thanos/{id}/integrations` — 인테그레이션 조회
3. 이전 상태와 비교, 전환 감지 시 `Notification.show()`
4. 상태 맵 업데이트

**Auth:** `webview.ts`에서 `getCachedAuthToken()` export → watcher에서 호출. 토큰이 없으면(플랫폼 미준비) 폴링 스킵.

## Status Transitions

### Stack (L2 Chain Deployment)

| 이전 상태 | 이후 상태 | 알림 종류 |
|-----------|-----------|-----------|
| `Deploying` or `Updating` | `Deployed` | Success |
| `Deploying` or `Updating` | `FailedToDeploy` or `FailedToUpdate` | Failure |

### Integration (Service Deployment)

| 이전 상태 | 이후 상태 | 알림 종류 |
|-----------|-----------|-----------|
| `InProgress` | `Completed` | Success |
| `InProgress` | `Failed` | Failure |

## Notification Content

| 상황 | Title | Body |
|------|-------|------|
| 스택 배포 성공 | "L2 Deployment Complete" | `"{name}" is now deployed and running.` |
| 스택 배포 실패 | "L2 Deployment Failed" | `"{name}" deployment failed. Check the dashboard for details.` |
| 인테그레이션 배포 성공 | "Service Deployment Complete" | `"{type}" service is now running.` |
| 인테그레이션 배포 실패 | "Service Deployment Failed" | `"{type}" service deployment failed.` |

OS 알림과 동시에 `NotificationStore.add()`로 인앱 알림도 추가한다.

## Lifecycle

- **시작:** `SetupPage` 완료 후 (`onComplete` 콜백) — 플랫폼 준비 완료 시점
- **정지:** `app.on('before-quit')` — 앱 종료 시
- **폴링 간격:** 10초 (`DEPLOYMENT_POLL_INTERVAL_MS = 10_000`)
- **초기 상태:** 앱 시작 시 현재 상태를 "이전 상태"로 기록 → 앱 재시작 시 이미 배포된 항목에 중복 알림 방지

## Files Changed

| 파일 | 변경 내용 |
|------|-----------|
| `src/main/deployment-watcher.ts` | 신규 생성 — 폴링 로직 전담 |
| `src/main/webview.ts` | `getCachedAuthToken()` export 추가 |
| `src/main/index.ts` | watcher import, `onComplete` 후 `start()`, `before-quit`에서 `stop()` |

## Error Handling

- API 호출 실패(네트워크 오류, 401 등): 조용히 스킵, 다음 폴링 재시도
- `Notification.isSupported()` false: OS 알림 생략, 인앱 알림만 기록
- 토큰 없음: 폴링 사이클 전체 스킵

## Testing

- `deployment-watcher.test.ts` 유닛 테스트:
  - `Deploying → Deployed` 전환 시 OS 알림 호출 검증
  - `InProgress → Completed` 전환 시 OS 알림 호출 검증
  - 동일 상태 유지 시 알림 미발송 검증
  - 초기 로드(이전 상태 없음) 시 알림 미발송 검증
  - API 오류 시 알림 미발송 검증
