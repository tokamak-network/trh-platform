# Requirements: TRH Preset Deployment Test Harness

**Defined:** 2026-03-26
**Core Value:** 각 Preset이 올바른 genesis config, predeploys, 모듈 구성, 체인 파라미터를 생성하는지 자동으로 검증

## v1 Requirements

### Preset Config (PSET)

- [ ] **PSET-01**: 4개 Preset(General, DeFi, Gaming, Full)이 각각 올바른 BatchFreq, OutputFreq, ChallengePeriod을 출력하는지 unit test
- [ ] **PSET-02**: Preset별 Backup 활성화 여부(General: off, DeFi/Gaming/Full: on)가 정확한지 검증
- [ ] **PSET-03**: 배포 대상 인프라별(Local Docker, AWS EC2) config 분기가 올바른지 검증
- [ ] **PSET-04**: Preset별 Genesis Predeploys 목록이 정확한지 검증 (OP Standard, DeFi: Uniswap/USDC/WrappedETH, Gaming: VRF/AA, Full: 전체)
- [ ] **PSET-05**: Preset별 모듈 활성화 매트릭스(Bridge, Explorer, Monitoring, Uptime)가 정확한지 검증
- [ ] **PSET-06**: Preset별 Fee Token 가용성(General: TON/ETH only, 나머지: +USDT/USDC)이 정확한지 검증
- [ ] **PSET-07**: 4개 Preset x 2개 인프라(Local/AWS)를 파라메트릭하게 순회하는 cross-preset regression matrix 테스트

### Funding Flow (FUND)

- [x] **FUND-01**: BIP44 키 파생이 seed phrase에서 admin/sequencer/batcher/proposer 4개 주소를 올바르게 생성하는지 검증
- [x] **FUND-02**: Testnet 최소 잔액 기준(0.5 ETH)이 올바르게 적용되는지 mock RPC로 검증
- [x] **FUND-03**: Mainnet 최소 잔액 기준(2 ETH)이 올바르게 적용되는지 mock RPC로 검증
- [x] **FUND-04**: 잔액 미달 시 배포 차단 로직이 올바르게 동작하는지 검증

### Docker Stack (DOCK)

- [ ] **DOCK-01**: docker-compose.yml 스키마가 유효한 구조(services, volumes, networks)를 갖추는지 Zod 기반 validation
- [ ] **DOCK-02**: 컨테이너 의존성 순서(postgres -> backend -> frontend)가 올바른지 검증
- [ ] **DOCK-03**: Health check 설정이 각 서비스에 올바르게 정의되어 있는지 검증
- [ ] **DOCK-04**: 환경변수 파일 참조(config/.env.backend, config/.env.frontend)가 올바른지 검증

### Deploy Target (DTGT)

- [ ] **DTGT-01**: Local Docker 배포 경로에서 docker compose 명령 호출 시퀀스가 올바른지 mock 검증
- [ ] **DTGT-02**: AWS EC2 배포 경로에서 Terraform init/plan/apply 호출 시퀀스가 올바른지 mock 검증
- [ ] **DTGT-03**: Local/AWS 공통 로직(Preset config 생성, 키 파생)과 인프라별 분기 로직이 올바르게 분리되는지 검증
- [ ] **DTGT-04**: AWS 배포 시 Security Group 포트(22, 3000, 8000) 설정이 올바른지 검증

### IPC Integration (IPC)

- [ ] **IPC-01**: Electron IPC 채널명이 main/renderer 간 일치하는지 검증 (채널 레지스트리 기반)
- [ ] **IPC-02**: keystore 관련 IPC payload(setSeedPhrase, getAccounts 등) 형태가 올바른지 검증
- [ ] **IPC-03**: Docker 관련 IPC payload(docker:status, docker:compose-up 등) 형태가 올바른지 검증
- [ ] **IPC-04**: Backend API contract(POST /preset-deploy) 요청/응답 스키마가 올바른지 검증
- [ ] **IPC-05**: WebView credential injection(window.__TRH_DESKTOP_ACCOUNTS__, window.__TRH_AWS_CREDENTIALS__)이 올바른 형태로 주입되는지 검증

### E2E Scenario (E2E)

- [ ] **E2E-01**: Playwright로 Preset 선택 -> 기본 정보 입력 -> 검토 화면까지 3-step wizard 흐름 검증
- [ ] **E2E-02**: 각 Preset 선택 시 올바른 모듈 미리보기와 예상 배포 시간이 표시되는지 검증
- [ ] **E2E-03**: 잔액 미달 시 배포 버튼이 비활성화되는지 검증
- [ ] **E2E-04**: 배포 시작 후 진행 상태가 올바르게 업데이트되는지 검증

### Infrastructure (INFR)

- [x] **INFR-01**: 테스트 실행에 Docker daemon, 실제 네트워크, AWS 자격증명이 불필요한지 확인
- [x] **INFR-02**: Vitest + Playwright 기반 테스트 환경 구성 및 CI 실행 가능
- [x] **INFR-03**: Preset fixture 데이터를 JSON으로 중앙 관리하여 테스트 간 공유
- [x] **INFR-04**: Zod 기반 API contract 스키마 정의로 mock 정합성 보장

## v2 Requirements

### Advanced Testing

- **ADV-01**: Multi-repo type contract alignment (TypeScript <-> Go struct JSON Schema 자동 검증)
- **ADV-02**: Deployment progress event stream 순서 검증 (docker:pull-progress 등)
- **ADV-03**: Integration health check 시퀀싱 테스트 (Bridge -> Explorer -> Monitoring 순서)
- **ADV-04**: Snapshot testing으로 genesis config 변경 감지

## Out of Scope

| Feature | Reason |
|---------|--------|
| 실제 L1/L2 RPC 통신 테스트 | Mock 기반 검증이 목적, 실제 블록체인 연결 불필요 |
| Docker 컨테이너 실제 기동 테스트 | CI에서 Docker daemon 불필요, 스키마 검증으로 대체 |
| CrossTrade 모듈 테스트 | 아직 개발 중이므로 범위 제외 |
| RegisterCandidate 기능 테스트 | 아직 개발 중이므로 범위 제외 |
| Helm/Kubernetes 배포 테스트 | 클라우드 인프라는 범위 외 |
| AWS 실제 인증/API 호출 테스트 | Mock으로 대체, 실제 AWS 연동 불필요 |
| 성능/부하 테스트 | 로직 정합성이 목적 |
| UI 스크린샷 비교 테스트 | 배포 로직 검증에 불필요, 유지보수 부담 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PSET-01 | Phase 1 | Pending |
| PSET-02 | Phase 1 | Pending |
| PSET-03 | Phase 1 | Pending |
| PSET-04 | Phase 1 | Pending |
| PSET-05 | Phase 1 | Pending |
| PSET-06 | Phase 1 | Pending |
| PSET-07 | Phase 1 | Pending |
| FUND-01 | Phase 1 | Complete |
| FUND-02 | Phase 1 | Complete |
| FUND-03 | Phase 1 | Complete |
| FUND-04 | Phase 1 | Complete |
| DOCK-01 | Phase 2 | Pending |
| DOCK-02 | Phase 2 | Pending |
| DOCK-03 | Phase 2 | Pending |
| DOCK-04 | Phase 2 | Pending |
| DTGT-01 | Phase 2 | Pending |
| DTGT-02 | Phase 2 | Pending |
| DTGT-03 | Phase 2 | Pending |
| DTGT-04 | Phase 2 | Pending |
| IPC-01 | Phase 3 | Pending |
| IPC-02 | Phase 3 | Pending |
| IPC-03 | Phase 3 | Pending |
| IPC-04 | Phase 3 | Pending |
| IPC-05 | Phase 3 | Pending |
| E2E-01 | Phase 4 | Pending |
| E2E-02 | Phase 4 | Pending |
| E2E-03 | Phase 4 | Pending |
| E2E-04 | Phase 4 | Pending |
| INFR-01 | Phase 1 | Complete |
| INFR-02 | Phase 1 | Complete |
| INFR-03 | Phase 1 | Complete |
| INFR-04 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after roadmap creation (4-phase structure)*
