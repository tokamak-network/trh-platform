---
phase: 04-platform-ui-integration
plan: "01"
subsystem: docker-compose-crosstrade-dapp
tags: [docker-compose, crosstrade, dapp, backend, be-08, plt-01, plt-02]
dependency_graph:
  requires: [03-04-SUMMARY.md]
  provides: [CrossTrade dApp Docker Compose template, BE-08 dApp container start]
  affects: [trh-backend/pkg/services/thanos/deployment.go, resources/docker-compose.crosstrade.yml]
tech_stack:
  added: []
  patterns: [non-fatal-warn-log, os.WriteFile, exec.CommandContext, docker-compose-multi-file]
key_files:
  created:
    - resources/docker-compose.crosstrade.yml
  modified:
    - ../trh-backend/pkg/services/thanos/deployment.go
decisions:
  - "BE-08 block is inside crossTrade-enabled conditional — only DeFi/Full presets trigger dApp start"
  - "compose file written at runtime to stack.DeploymentPath so relative env_file resolves correctly"
  - "dApp container start is non-fatal: failure logged as Warn, deployment proceeds normally"
  - "os and os/exec imports added to deployment.go for WriteFile and CommandContext"
metrics:
  duration: "5 min"
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_changed: 2
---

# Phase 04 Plan 01: CrossTrade dApp Docker Compose + BE-08 Summary

**One-liner:** CrossTrade dApp Docker Compose template (port 3004:3000) and runtime compose file write + container start triggered by Backend after successful CrossTrade install (DeFi/Full presets only).

## What Was Built

### Task 1: docker-compose.crosstrade.yml template (PLT-01)

`resources/docker-compose.crosstrade.yml` 생성. `tokamaknetwork/cross-trade-app:latest` 이미지를 포트 3004:3000으로 서비스하며, `./config/.env.crosstrade` 환경 파일을 참조한다.

### Task 2: BE-08 dApp compose file write + container start (BE-08, PLT-02)

`deployment.go`의 CrossTrade 성공 블록에 BE-08 코드 추가:
1. `.env.crosstrade` 쓰기 완료 후, `stack.DeploymentPath/docker-compose.crosstrade.yml` 생성
2. `docker compose -f {path} up -d` 실행으로 dApp 컨테이너 시작
3. 모든 실패는 non-fatal (Warn 로그만 출력)
4. `def.Modules["crossTrade"]` 조건 블록 안에만 위치 — DeFi/Full 전용

## Verification Results

- `resources/docker-compose.crosstrade.yml` YAML 구조 검증 PASS
- `go build ./pkg/services/thanos/...` PASS
- BE-08 compose 참조가 crossTrade 조건 이후 위치 확인 PASS (pos 13954 > 9030)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `resources/docker-compose.crosstrade.yml` — FOUND
- `deployment.go` contains `crossTradeComposePath` — FOUND
- trh-platform commit `df72f76` — FOUND
- trh-backend commit `bb2d9e4` — FOUND
