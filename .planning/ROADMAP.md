# Roadmap: TRH Preset Deployment Test Harness

## Overview

Preset 배포 흐름의 mock 기반 테스트 suite를 bottom-up으로 구축한다. 먼저 테스트 인프라와 fixture를 세우고 Preset/Funding 핵심 로직을 unit test로 검증한 뒤, Docker/Deploy Target 스키마 validation, IPC 통합 테스트, 마지막으로 Playwright E2E 시나리오 순서로 진행한다. 모든 외부 의존성은 mock/stub으로 대체하며, 4개 Preset x 2개 인프라(Local Docker, AWS EC2) 조합을 파라메트릭하게 커버한다.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Preset Logic** - Test infra setup, fixture data, Preset config/Funding unit tests
- [ ] **Phase 2: Docker Stack & Deploy Target** - Docker compose schema validation and deployment path verification
- [ ] **Phase 3: IPC Integration** - Electron IPC and Backend API contract integration tests
- [ ] **Phase 4: E2E Wizard Scenarios** - Playwright full-flow preset deployment scenarios

## Phase Details

### Phase 1: Foundation & Preset Logic
**Goal**: 테스트 인프라가 구축되고, 4개 Preset의 config/funding 핵심 로직이 unit test로 검증된 상태
**Depends on**: Nothing (first phase)
**Requirements**: INFR-01, INFR-02, INFR-03, INFR-04, PSET-01, PSET-02, PSET-03, PSET-04, PSET-05, PSET-06, PSET-07, FUND-01, FUND-02, FUND-03, FUND-04
**Success Criteria** (what must be TRUE):
  1. `npm test` 실행 시 Vitest가 tests/ 디렉토리의 unit test를 발견하고 실행할 수 있다
  2. 4개 Preset(General, DeFi, Gaming, Full)에 대해 BatchFreq, OutputFreq, Backup, Predeploys, Module, FeeToken이 기대값과 일치하는 테스트가 통과한다
  3. BIP44 seed phrase에서 4개 계정(admin/sequencer/batcher/proposer) 주소가 올바르게 파생되는 테스트가 통과한다
  4. Testnet 0.5 ETH / Mainnet 2 ETH 잔액 기준과 미달 시 차단 로직 테스트가 통과한다
  5. 4 Preset x 2 인프라(Local/AWS) 파라메트릭 cross-regression matrix가 모두 통과한다
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Test infra setup: Vitest config, zod, golden JSON fixture, schemas, helpers
- [ ] 01-02-PLAN.md — Preset config unit tests (PSET-01~07): chain params, modules, predeploys, fee tokens, matrix
- [x] 01-03-PLAN.md — Funding flow unit tests (FUND-01~04): BIP44 derivation, balance thresholds, blocking logic

### Phase 2: Docker Stack & Deploy Target
**Goal**: Docker compose 스키마와 Local/AWS 배포 경로의 명령 시퀀스가 검증된 상태
**Depends on**: Phase 1
**Requirements**: DOCK-01, DOCK-02, DOCK-03, DOCK-04, DTGT-01, DTGT-02, DTGT-03, DTGT-04
**Success Criteria** (what must be TRUE):
  1. docker-compose.yml이 Zod 스키마 validation을 통과하고 services/volumes/networks 구조가 유효하다
  2. 컨테이너 의존성 순서(postgres -> backend -> frontend)와 health check 설정이 올바른 테스트가 통과한다
  3. Local Docker 경로의 docker compose 명령 시퀀스와 AWS EC2 경로의 Terraform init/plan/apply 시퀀스가 mock 검증을 통과한다
  4. Local/AWS 공통 로직과 인프라별 분기 로직이 올바르게 분리되어 있음을 검증하는 테스트가 통과한다
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Docker compose Zod schema validation (DOCK-01~04): js-yaml parsing, service structure, dependencies, healthcheck, env vars
- [ ] 02-02-PLAN.md — Deploy target sequence tests (DTGT-01~04): Local Docker commands, AWS Terraform sequence, security group ports

### Phase 3: IPC Integration
**Goal**: Electron IPC 채널과 Backend API contract이 올바른 payload로 통신하는 것이 검증된 상태
**Depends on**: Phase 1
**Requirements**: IPC-01, IPC-02, IPC-03, IPC-04, IPC-05
**Success Criteria** (what must be TRUE):
  1. Electron IPC 채널명이 main/renderer 간 일치하는 것을 채널 레지스트리 기반으로 검증하는 테스트가 통과한다
  2. keystore/Docker 관련 IPC payload 형태가 Zod 스키마와 일치하는 테스트가 통과한다
  3. POST /preset-deploy 요청/응답 스키마가 Backend API contract과 일치하는 테스트가 통과한다
  4. WebView credential injection(window.__TRH_DESKTOP_ACCOUNTS__, window.__TRH_AWS_CREDENTIALS__)이 올바른 형태로 주입되는 테스트가 통과한다
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: E2E Wizard Scenarios
**Goal**: Playwright로 Preset 선택부터 배포 시작까지 전체 사용자 흐름이 검증된 상태
**Depends on**: Phase 2, Phase 3
**Requirements**: E2E-01, E2E-02, E2E-03, E2E-04
**Success Criteria** (what must be TRUE):
  1. Playwright가 Preset 선택 -> 기본 정보 입력 -> 검토 화면까지 3-step wizard를 자동으로 완주한다
  2. 각 Preset 선택 시 올바른 모듈 미리보기와 예상 배포 시간이 표시되는 것을 검증한다
  3. 잔액 미달 시 배포 버튼이 비활성화되고, 잔액 충분 시 활성화되는 것을 검증한다
  4. 배포 시작 후 진행 상태 업데이트가 올바르게 표시되는 것을 검증한다
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 04-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Preset Logic | 0/3 | Planning complete | - |
| 2. Docker Stack & Deploy Target | 0/2 | Planning complete | - |
| 3. IPC Integration | 0/1 | Not started | - |
| 4. E2E Wizard Scenarios | 0/1 | Not started | - |
