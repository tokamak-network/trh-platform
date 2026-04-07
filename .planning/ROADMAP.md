# Roadmap: CrossTrade TRH Integration

## Overview

DeFi/Full Preset L2 배포에 CrossTrade 프로토콜 자동 통합을 구현한다. SDK에서 L1 Deposit Tx 기반 L2 컨트랙트 배포를 구현하고, Backend에서 auto-install 파이프라인과 L1 setChainInfo 등록을 처리하며, Platform/UI에서 dApp 컨테이너와 상태 카드를 추가한 뒤, Sepolia E2E 검증으로 마무리한다. 4개 레포(trh-sdk, trh-backend, trh-platform, trh-platform-ui) 순차 작업이며, 기존 AWS CrossTrade 코드는 수정하지 않고 새 파일로 병존한다.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: SDK L1 Deposit Tx Deployment** - L1 OptimismPortal을 통한 CrossTrade L2 컨트랙트 4개 배포 함수 구현 (completed 2026-04-06)
- [ ] **Phase 2: Preset Alignment** - SDK/Backend/UI 전체에서 DeFi=crossTrade true, Gaming=false 정합성 확보
- [ ] **Phase 3: Backend Auto-Install Pipeline** - 로컬 배포 시 CrossTrade 자동 설치 (SDK 호출 -> setChainInfo -> dApp 시작)
- [ ] **Phase 4: Platform & UI Integration** - Docker Compose dApp 서비스 추가 및 CrossTrade 상태 카드 UI
- [ ] **Phase 5: E2E Sepolia Validation** - Sepolia에서 전체 CrossTrade 플로우 검증

## Phase Details

### Phase 1: SDK L1 Deposit Tx Deployment
**Goal**: DeployCrossTradeLocal() 함수가 L1 Deposit Tx 12-14단계를 통해 CrossTrade L2 컨트랙트 4개를 배포하고 주소를 반환한다
**Depends on**: Nothing (first phase)
**Requirements**: SDK-01, SDK-02, SDK-03, SDK-04, SDK-05, SDK-06, SDK-07
**Success Criteria** (what must be TRUE):
  1. cross_trade_local.go의 DeployCrossTradeLocal()이 L1 OptimismPortal.depositTransaction()을 호출하여 L2CrossTrade impl+proxy를 배포할 수 있다
  2. L2toL2CrossTradeL2 impl+proxy도 동일한 패턴으로 배포할 수 있다
  3. 각 Deposit Tx 후 L2 receipt status==1을 확인하여 배포 성공을 검증한다
  4. DeployCrossTradeLocalOutput 구조체가 4개 컨트랙트 주소를 정확히 반환한다
  5. OptimismPortal ABI 바인딩이 abigen으로 생성되어 Go 코드에서 사용 가능하다
**Plans:** 3/3 plans complete

Plans:
- [x] 01-01-PLAN.md — ABI 추출, abigen 바인딩 생성, 타입 정의 스캐폴드
- [x] 01-02-PLAN.md — Deposit Tx 헬퍼 함수 + L2CrossTrade 쌍 7-step 배포 시퀀스
- [x] 01-03-PLAN.md — L2toL2CrossTrade 쌍 배포 + DeployCrossTradeLocal 전체 조립

### Phase 2: Preset Alignment
**Goal**: DeFi/Full preset에 crossTrade=true, Gaming에 crossTrade=false가 SDK, Backend, UI 전체에서 일관되게 설정된다
**Depends on**: Nothing (Phase 1과 독립적, preset 설정은 배포 함수와 별개)
**Requirements**: SDK-08, SDK-09, SDK-10, BE-01, BE-02
**Success Criteria** (what must be TRUE):
  1. SDK PresetModules에서 DeFi=crossTrade true, Gaming=crossTrade removed/false, Full=crossTrade true가 설정된다
  2. Backend stack_lifecycle.go의 localUnsupported에서 crossTrade 항목이 제거되어 로컬 배포가 허용된다
  3. 로컬 infra에서 DeFi/Full preset 배포 시 CrossTrade integration entity가 생성된다
**Plans:** 1/2 plans executed

Plans:
- [x] 02-01-PLAN.md — Wave 0 TDD: SDK PresetModules + Backend localUnsupported 테스트 스캐폴드
- [x] 02-02-PLAN.md — SDK/Backend crossTrade 정합성 코드 수정 (3파일, ~8줄)

### Phase 3: Backend Auto-Install Pipeline
**Goal**: 로컬 DeFi/Full preset 배포 시 CrossTrade가 자동으로 설치된다 (SDK 호출, L1 setChainInfo, dApp 시작까지)
**Depends on**: Phase 1 (SDK DeployCrossTradeLocal 함수 필요), Phase 2 (localUnsupported 해제 및 preset 설정 필요)
**Requirements**: BE-03, BE-04, BE-05, BE-06, BE-07, BE-08, BE-09, BE-10, BE-11
**Success Criteria** (what must be TRUE):
  1. deployment.go의 auto-install 블록에서 CrossTrade 활성화 preset일 때 SDK DeployCrossTradeLocal()을 호출한다
  2. SDK 배포 완료 후 L1 CrossTradeProxy.setChainInfo()와 L2toL2CrossTradeL1.setChainInfo()가 자동 실행된다
  3. setChainInfo 실패 시 최대 3회 재시도가 동작한다
  4. config/.env.crosstrade 파일이 자동 생성되고 CrossTrade dApp Docker 컨테이너가 시작된다
  5. integration metadata에 배포된 컨트랙트 주소와 dApp URL이 저장된다
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

### Phase 4: Platform & UI Integration
**Goal**: CrossTrade dApp이 Docker Compose로 관리되고, Platform UI에서 CrossTrade 상태를 확인할 수 있다
**Depends on**: Phase 2 (preset 정합성 필요), Phase 3과는 독립적으로 병행 가능하나 순차 실행 모드에서는 Phase 3 이후
**Requirements**: PLT-01, PLT-02, UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. docker-compose에 CrossTrade dApp 서비스가 port 3004로 정의되어 있다
  2. CrossTrade dApp 서비스는 DeFi/Full preset에서만 시작된다
  3. Platform UI의 preset.ts에서 DeFi crossTrade=true, Gaming crossTrade=false가 설정된다
  4. Rollup Detail Components 탭에 CrossTrade 상태 카드가 dApp URL 링크(localhost:3004)와 함께 표시된다
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD

### Phase 5: E2E Sepolia Validation
**Goal**: Sepolia 테스트넷에서 CrossTrade 전체 플로우가 검증된다
**Depends on**: Phase 3, Phase 4 (전체 파이프라인 완성 필요)
**Requirements**: E2E-01, E2E-02, E2E-03
**Success Criteria** (what must be TRUE):
  1. DeFi preset으로 Sepolia L2 배포 후 CrossTrade L2 컨트랙트 4개가 정상 배포된다
  2. L1 setChainInfo가 성공적으로 호출되어 CrossTrade 사용 가능 상태가 된다
  3. CrossTrade dApp이 http://localhost:3004에서 접근 가능하다
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. SDK L1 Deposit Tx Deployment | 3/3 | Complete   | 2026-04-06 |
| 2. Preset Alignment | 1/2 | In Progress|  |
| 3. Backend Auto-Install Pipeline | 0/3 | Not started | - |
| 4. Platform & UI Integration | 0/3 | Not started | - |
| 5. E2E Sepolia Validation | 0/2 | Not started | - |
