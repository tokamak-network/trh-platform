# TRH Preset Deployment Test Harness

## What This Is

TRH 플랫폼의 4가지 Preset(General, DeFi, Gaming, Full) 배포 흐름을 실제 L1/L2 통신 없이 mock 기반으로 검증하는 테스트 suite. Electron → Platform UI → Backend API → trh-sdk 전 구간의 로직 정합성을 단위/통합/E2E 테스트로 커버한다.

## Core Value

각 Preset이 올바른 genesis config, predeploys, 모듈 구성, 체인 파라미터를 생성하는지 자동으로 검증할 수 있어야 한다.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Preset별 genesis config 생성 로직이 올바른 파라미터를 출력하는지 unit test
- [ ] EOA funding flow가 Preset/network에 맞는 최소 잔액 기준으로 동작하는지 mock test
- [ ] Docker compose 스택 오케스트레이션의 health check, 컨테이너 순서가 올바른지 schema validation
- [ ] Electron IPC ↔ Backend 통신이 올바른 payload를 주고받는지 integration test
- [ ] Preset 선택 → L2 노드 가동까지의 전체 흐름을 E2E로 검증하는 Playwright 시나리오
- [ ] 4개 Preset(General, DeFi, Gaming, Full) 각각에 대해 테스트 커버리지 확보
- [ ] Preset별 predeploys 목록(OP Standard, DeFi: Uniswap/USDC, Gaming: VRF/AA, Full: 전체)이 정확한지 검증
- [ ] Preset별 모듈 활성화(Bridge, Explorer, Monitoring, Uptime) 조합이 올바른지 검증

### Out of Scope

- 실제 L1/L2 체인 통신 — mock으로 대체, 실제 블록체인 연결 불필요
- CrossTrade 모듈 — 아직 개발 중이므로 테스트 범위에서 제외
- Helm/Kubernetes 배포 — 클라우드 인프라 테스트는 범위 외
- AWS 인증/자격증명 테스트 — 실제 AWS 연동 불필요
- 성능/부하 테스트 — 로직 정합성 검증이 목적

## Context

- TRH Platform은 Electron(Desktop) + Next.js(UI) + Go(Backend) + Go(SDK) 4개 저장소로 구성
- 배포 흐름: Electron → docker compose up → Platform UI (3-Step Wizard) → POST /preset-deploy → trh-sdk CLI → L1 컨트랙트 → L2 Genesis → 모듈 설치
- 4개 Preset은 모듈 구성, 체인 파라미터(BatchFreq, OutputFreq 등), Genesis Predeploys, Fee Token 가용성이 다름
- BIP44 키 파생으로 seed phrase에서 admin/sequencer/batcher/proposer 4개 계정 생성
- 펀딩 기준: testnet 0.5 ETH, mainnet 2 ETH 이상
- 테스트 코드는 trh-platform 저장소의 `tests/` 디렉토리에 집중 배치

### Preset 비교표

| 항목 | General | DeFi | Gaming | Full |
|------|---------|------|--------|------|
| BatchFreq | 1800s | 900s | 300s | 600s |
| OutputFreq | 1800s | 900s | 600s | 600s |
| Backup | off | on | on | on |
| RegisterCandidate | off | off | off | on |
| Bridge | ✓ | ✓ | ✓ | ✓ |
| Block Explorer | ✓ | ✓ | ✓ | ✓ |
| Monitoring | — | ✓ | ✓ | ✓ |
| Uptime Service | — | ✓ | ✓ | ✓ |
| DeFi Predeploys | — | ✓ | — | ✓ |
| Gaming Predeploys | — | — | ✓ | ✓ |
| Fee Tokens | TON, ETH | TON, ETH, USDT, USDC | TON, ETH, USDT, USDC | TON, ETH, USDT, USDC |

## Constraints

- **Tech stack**: TypeScript/Vitest (unit/integration), Playwright (E2E) — trh-platform이 Electron + TypeScript 기반
- **Mock boundary**: 모든 외부 의존성(L1/L2 RPC, Docker, Helm, AWS)은 mock/stub 처리
- **Location**: 모든 테스트 코드는 `trh-platform/tests/` 디렉토리에 위치
- **Dependencies**: 4개 저장소(trh-platform, trh-sdk, trh-backend, trh-platform-ui)의 코드를 참조하되, 테스트 실행은 trh-platform에서 수행

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 전체 mock 기반 | 실제 체인 없이 CI에서 빠르게 검증 가능 | — Pending |
| CrossTrade 제외 | 아직 개발 중인 모듈 | — Pending |
| 테스트 중앙집중 (trh-platform/tests/) | 배포 흐름이 여러 저장소를 걸치므로 한 곳에서 통합 검증 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-26 after initialization*
