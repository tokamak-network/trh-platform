# Product Requirements Document: DRB Node Auto-Installation

**Author**: Theo  
**Date**: 2026-04-10  
**Status**: Draft  
**Stakeholders**: TRH Platform Team, DRB-node Team, trh-sdk Team

---

## 1. Executive Summary

TRH Platform Desktop App에서 Gaming 또는 Full 프리셋으로 L2를 배포할 때, DRB(Distributed Random Beacon) 노드가 자동으로 설치·실행되도록 한다. 현재는 프리셋 정의에 `"drb": true` 플래그와 integration URL(`http://localhost:9600`) 등록만 존재하며, 실제 DRB 노드(leader + regular) 컨테이너 생성, 스마트 컨트랙트 배포, 계정 펀딩, P2P 부트스트랩 등 전체 설치 자동화가 구현되어 있지 않다. 로컬 인프라(Docker Compose)와 AWS 인프라(EC2 + Helm Chart) 양쪽 모두를 지원한다.

---

## 2. Background & Context

### 현재 상태

TRH Platform은 프리셋 기반 원클릭 L2 배포를 제공한다. Gaming/Full 프리셋에 DRB 모듈이 활성화되어 있지만, 실제 구현 상태는 다음과 같다:

| 항목 | 구현 상태 |
|------|----------|
| 프리셋 정의에 `"drb": true` | ✅ 완료 |
| Genesis predeploy에 VRF/VRFCoordinator 포함 | ✅ 완료 |
| 배포 후 integration URL 등록 (`localhost:9600`) | ✅ 완료 (placeholder) |
| `Commit2RevealDRB` 컨트랙트 배포 | ❌ 미구현 |
| DRB 노드 컨테이너 생성/실행 | ❌ 미구현 |
| Peer ID 생성 | ❌ 미구현 |
| 계정 파생 및 ETH 펀딩 | ❌ 미구현 |
| DRB 언인스톨 | ✅ 완료 (integration 제거만) |

### DRB 아키텍처 요약

DRB는 분산 커밋-리빌 프로토콜로, L2 체인 위에서 검증 가능한 랜덤성을 생성한다:

- **Leader node**: 라운드를 조율하고, Merkle root를 제출하며, 랜덤 넘버를 생성한다.
- **Regular node**: 커밋-리빌 프로토콜에 참여하여 CVS/COS 값을 제출하고, 시크릿을 순차 공개한다.
- **Commit2RevealDRB 컨트랙트**: 온체인 상태 관리(라운드, 활성화, 디포짓 등)를 담당한다.
- **PostgreSQL**: 각 노드별 로컬 상태 저장(커밋 데이터, 리빌 순서, 노드 정보 등).

### VRF/VRFCoordinator와의 관계

Gaming 프리셋의 genesis predeploy에 포함된 VRF(`0x42...0200`)/VRFCoordinator(`0x42...0201`)는 dApp이 호출하는 온체인 랜덤성 인터페이스 컨트랙트이다. DRB 노드는 이 인터페이스 뒤에서 실제 랜덤성을 생성하는 오프체인 프로토콜이다. 현재 VRF/VRFCoordinator ↔ Commit2RevealDRB 간 연동은 미구현 상태이며, **본 PRD 스코프에 포함되지 않는다** (별도 PRD로 관리).

### 코드베이스 참조

| 레포지토리 | 역할 |
|-----------|------|
| `trh-platform` | Electron Desktop App (IPC, Docker 관리) |
| `trh-platform-ui` | Next.js 웹 UI (프리셋 위저드, 배포 대시보드) |
| `trh-backend` | Go 백엔드 (배포 오케스트레이션, SDK 호출) |
| `DRB-node` | Go DRB 노드 (leader/regular P2P 노드) |
| `Commit-Reveal2` | DRB 스마트 컨트랙트 (Solidity) |
| `tokamak-thanos-stack` | Helm Chart 관리 (AWS 배포용, 신규 개발 필요) |

---

## 3. Objectives & Success Metrics

### Goals

1. Gaming 또는 Full 프리셋으로 L2 배포 시 DRB leader(1대) + regular(1대) 노드가 자동 설치·실행된다.
2. 로컬(Docker Compose) 및 AWS(EC2 + Helm Chart) 인프라 모두 지원한다.
3. DRB 노드 설치 실패가 L2 배포 성공에 영향을 주지 않는다 (독립적 에러 처리).
4. L2 배포 후 사용자가 regular 노드를 추가 배포할 수 있다.
5. DRB만 독립적으로 재설치할 수 있다.

### Non-Goals

1. VRF/VRFCoordinator ↔ Commit2RevealDRB 간 온체인 연동 (별도 PRD)
2. DRB 노드 모니터링 대시보드 (추후 Monitoring 모듈에 통합)
3. DRB 노드 자동 스케일링 (사용자가 수동으로 regular 노드 추가)
4. Mainnet 지원 (Mainnet은 로컬 인프라 미지원이며, AWS DRB 배포는 Helm Chart 안정화 이후 지원)
5. DRB 노드 업그레이드/마이그레이션 자동화

### Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| DRB 자동 설치 성공률 (로컬) | 0% (미구현) | ≥ 95% | 배포 로그 기반 |
| DRB 자동 설치 성공률 (AWS) | 0% (미구현) | ≥ 90% | 배포 로그 기반 |
| L2 배포 → DRB 첫 라운드 완료 시간 | N/A | < 5분 (로컬) | 컨트랙트 이벤트 기반 |
| DRB 설치 실패 시 L2 정상 운영률 | N/A | 100% | L2 health check |
| Regular 노드 추가 배포 성공률 | 0% (미구현) | ≥ 95% | 배포 로그 기반 |

---

## 4. Target Users & Segments

### Primary: L2 운영자 (롤업 배포자)

TRH Platform을 사용하여 자체 L2 체인을 배포하는 프로젝트 팀. Gaming 프리셋을 선택하는 GameFi/NFT 프로젝트 또는 Full 프리셋을 선택하는 엔터프라이즈 고객.

- DRB 노드 운영에 대한 기술적 이해가 낮을 수 있음
- "원클릭 배포" 경험을 기대함
- 배포 후 노드 수 조절 등 기본적인 운영 자율성 필요

### Secondary: dApp 개발자

배포된 L2 위에서 랜덤성이 필요한 게임, 복권, NFT 민트 등을 개발하는 개발자.

- DRB가 정상 작동 중인 L2에서 VRF 컨트랙트 호출을 통해 랜덤 값을 얻음
- 본 PRD 스코프에서는 DRB 노드 설치까지만 담당 (VRF 연동은 별도)

---

## 5. User Stories & Requirements

### P0 — Must Have

| # | User Story | Acceptance Criteria |
|---|-----------|-------------------|
| 1 | Gaming/Full 프리셋으로 L2 배포 시, DRB leader(1) + regular(1) 노드가 L2 배포 완료 후 자동으로 설치·실행된다 | - L2 healthy 확인 후 DRB 설치 시작 - Leader 먼저 시작 → Regular 연결 - Regular가 deposit + activate 완료 - 노드 간 P2P 통신 확인 |
| 2 | `Commit2RevealDRB` 컨트랙트가 L2 genesis predeploy로 포함된다 | - Constructor args 하드코딩 (`activationThreshold`: 1e16, `flatFee`: TBD, `maxActivatedOperators`: 100, `name`/`version`: TBD) - Genesis 생성 시 predeploy 주소에 바이트코드 배치 - L2 시작 후 컨트랙트 호출 가능 확인 |
| 3 | DRB 노드용 키가 기존 seed phrase에서 자동 파생된다 | - Leader: Admin key(index 0) 재사용 - Regular #1: index 5에서 파생 - 추가 Regular: index 6, 7, ... 순서 |
| 4 | DRB 노드 계정에 native token(TON)이 자동 펀딩된다 | - Admin 계정에서 DRB 계정으로 L2 내부 전송 - Regular: 최소 0.1 TON (deposit 0.01 + 가스비 여유분) - Leader: 최소 0.5 TON (라운드 관리 가스비) |
| 5 | DRB 설치 실패 시 L2 배포는 성공으로 처리되고, DRB 상태만 FAILED로 표시된다 | - L2 stack status: DEPLOYED - DRB integration status: FAILED - 에러 메시지 로그 기록 - UI에서 DRB 실패 상태 확인 가능 |
| 6 | DRB만 독립적으로 재설치할 수 있다 | - UI 또는 API에서 DRB 재설치 트리거 가능 - 기존 컨트랙트(genesis predeploy)는 유지 - 노드 컨테이너만 재생성 |
| 7 | 로컬 인프라에서 Docker Compose로 DRB 노드가 배포된다 | - leaderpostgres + leadernode 컨테이너 - regularpostgres + regularnode 컨테이너 - Docker network 자동 생성 - Peer ID 자동 생성 |
| 8 | Docker Hub에서 `tokamaknetwork/drb-node:latest` 이미지를 pull하여 사용한다 | - 소스 빌드 불필요 - latest 태그 사용 - DRB-node 레포 main 브랜치 push 시 CD workflow로 이미지 자동 배포 |

### P1 — Should Have

| # | User Story | Acceptance Criteria |
|---|-----------|-------------------|
| 9 | L2 배포 후 사용자가 regular 노드를 추가할 수 있다 | - UI에서 "Add Regular Node" 기능 - 새 키 파생 (다음 index) - 자동 deposit + activate - Leader에 P2P 등록 확인 |
| 10 | AWS 인프라에서 EC2 인스턴스에 DRB 노드가 Helm Chart로 배포된다 | - tokamak-thanos-stack 레포에 DRB Helm Chart 추가 - trh-sdk에서 Helm 실행 - EC2 내 PostgreSQL (내장) - Leader/Regular 분리 배포 |
| 11 | DRB 노드 상태를 UI에서 확인할 수 있다 | - Leader/Regular 노드 running 상태 - P2P 연결 상태 - 현재 라운드/트라이얼 번호 - 활성화된 오퍼레이터 수 |
| 12 | fee token이 non-TON인 경우에도 DRB 노드 펀딩이 정상 동작한다 | - Native gas token은 항상 TON - fee token 설정과 무관하게 TON으로 펀딩 - Admin 계정 TON 잔고 검증 후 전송 |

### P2 — Nice to Have / Future

| # | User Story | Acceptance Criteria |
|---|-----------|-------------------|
| 13 | Regular 노드 제거 기능 | - 특정 regular 노드 중지/삭제 - 온체인 deactivate 처리 |
| 14 | DRB 노드 로그를 UI에서 실시간 확인 | - Docker 로그 스트리밍 - 에러 하이라이트 |
| 15 | DRB 노드 Docker 이미지 버전 선택 | - latest 외 특정 태그 지정 가능 |
| 16 | VRF/VRFCoordinator ↔ Commit2RevealDRB 온체인 연동 | - 별도 PRD로 관리 |

---

## 6. Solution Overview

### 6.1 전체 아키텍처

```
L2 배포 완료 (DEPLOYED)
       │
       ▼
[DRB Auto-Install Pipeline]
       │
       ├─ 1. Commit2RevealDRB genesis predeploy 확인
       │     (L2 genesis에 이미 포함됨)
       │
       ├─ 2. 계정 파생
       │     ├─ Leader: Admin key (index 0) 재사용
       │     └─ Regular #1: index 5 파생
       │
       ├─ 3. 계정 펀딩 (Admin → DRB 계정)
       │     ├─ Leader 계정: 0.5 TON 전송
       │     └─ Regular 계정: 0.1 TON 전송
       │
       ├─ 4. Peer ID 생성
       │     ├─ Leader: static-key/leadernode.bin
       │     └─ Regular: static-key/regularnode.bin
       │
       ├─ 5. Leader 노드 시작
       │     ├─ PostgreSQL 컨테이너
       │     └─ Leader 노드 컨테이너
       │     └─ Health check 대기
       │
       ├─ 6. Regular 노드 시작
       │     ├─ PostgreSQL 컨테이너
       │     └─ Regular 노드 컨테이너
       │     └─ deposit() + activate() 자동 실행
       │     └─ Leader에 P2P registration
       │
       └─ 7. Integration 상태 업데이트
             └─ DRB status: INSTALLED
```

### 6.2 로컬 인프라 (Docker Compose)

기존 L2 Docker Compose 프로젝트와 별도로 DRB용 Docker Compose를 생성한다.

**서비스 구성:**

| Service | Image | Port | Depends On |
|---------|-------|------|------------|
| drb-leader-postgres | postgres:14.13 | 5442:5432 | — |
| drb-leader | tokamaknetwork/drb-node:latest | 9600 (P2P) | drb-leader-postgres healthy |
| drb-regular-postgres | postgres:14.13 | 5443:5432 | — |
| drb-regular-1 | tokamaknetwork/drb-node:latest | 9601 (P2P) | drb-regular-postgres healthy, drb-leader healthy |

**Docker Compose 생성 위치:**
```
/storage/deployments/Thanos/{network}/{stackId}/drb/
├── docker-compose.yml       (자동 생성)
├── static-key/
│   ├── leadernode.bin        (자동 생성)
│   └── regularnode1.bin      (자동 생성)
└── .env                      (자동 생성)
```

**환경변수 자동 구성:**

```env
# Common
CONTRACT_ADDRESS=0x{predeploy_address}
CHAIN_ID={l2_chain_id}
ETH_RPC_URLS=http://host.docker.internal:9545
POSTGRES_PASSWORD={auto_generated}

# Leader
NODE_TYPE=leader
LEADER_PRIVATE_KEY={admin_private_key}
LEADER_PORT=9600

# Regular
NODE_TYPE=regular
EOA_PRIVATE_KEY={derived_index_5_key}
PORT=9601
LEADER_IP=drb-leader
LEADER_PORT=9600
LEADER_PEER_ID={generated_peer_id}
```

### 6.3 AWS 인프라 (EC2 + Helm Chart)

**신규 개발 필요 항목:**

1. `tokamak-thanos-stack` 레포에 DRB Helm Chart 추가
2. `trh-sdk`에서 DRB Helm Chart 실행 지원

**EC2 구성:**
- Leader node + PostgreSQL: 1대 EC2 인스턴스
- Regular node + PostgreSQL: 노드당 1대 EC2 인스턴스
- Docker Compose로 노드 실행 (Helm Chart가 EC2 provisioning + compose 배포 관리)

### 6.4 컨트랙트 Genesis Predeploy

`Commit2RevealDRB` 컨트랙트를 L2 genesis predeploy에 포함한다.

**기술적 타당성:**
- 바이트코드 크기: 22,325 bytes (EVM 제한 24,576 bytes 이내)
- Proxy 패턴 없음 (standalone)
- Constructor args가 모두 결정론적 primitive 타입

**Constructor Arguments (하드코딩):**

| Parameter | Value | 비고 |
|-----------|-------|------|
| `activationThreshold` | 1e16 (0.01 TON) | Regular 노드 활성화 최소 디포짓 |
| `flatFee` | TBD | 리서치 필요 — 랜덤 넘버 요청 수수료 |
| `maxActivatedOperators` | 100 | 최대 활성 오퍼레이터 수 |
| `name` | "Commit2RevealDRB" | EIP-712 서명용 |
| `version` | "1" | EIP-712 서명용 |

**Predeploy 주소 할당:** TBD — 기존 `0x4200...0200` (VRF), `0x4200...0201` (VRFCoordinator) 이후 주소 사용. 예: `0x4200000000000000000000000000000000000202`

**구현 위치:** `trh-backend`의 preset 정의 및 genesis 생성 로직 (trh-sdk의 genesis builder에 predeploy 추가)

### 6.5 키 파생 전략

기존 BIP44 파생 경로(`m/44'/60'/0'/0/{index}`)를 확장한다:

| Index | Role | 용도 |
|-------|------|------|
| 0 | Admin | L2 chain owner + **DRB Leader** (재사용) |
| 1 | Sequencer | L2 블록 생성 |
| 2 | Batcher | 트랜잭션 배치 |
| 3 | Proposer | Output root 제출 |
| 4 | Challenger | 분쟁 프로토콜 |
| **5** | **DRB Regular #1** | **DRB 커밋-리빌 참여 (신규)** |
| **6+** | **DRB Regular #2+** | **추가 Regular 노드 (확장)** |

### 6.6 계정 펀딩 플로우

```
L2 배포 완료
    │
    ▼
Admin 계정 (index 0) — genesis에서 prefund됨
    │
    ├─ Regular #1 (index 5)에 0.1 TON 전송
    │   └─ L2 내부 트랜잭션 (eth_sendTransaction)
    │
    └─ (Leader = Admin이므로 별도 전송 불필요)
```

fee token 설정과 무관하게 **native gas token은 항상 TON**이므로, TON으로 펀딩한다. Admin 계정의 TON 잔고가 부족할 경우 DRB 설치를 FAILED 처리하고 에러 메시지를 출력한다.

### 6.7 부트스트랩 시퀀스 (상세)

```
Step 1: L2 Health Check
  - L2 RPC 응답 확인 (eth_blockNumber)
  - 블록 생성 시작 확인

Step 2: Commit2RevealDRB 컨트랙트 확인
  - Genesis predeploy 주소에 코드 존재 확인 (eth_getCode)
  - s_activationThreshold() 호출로 정상 작동 확인

Step 3: 계정 준비
  - Admin key에서 Regular key 파생 (index 5)
  - Admin → Regular 계정에 TON 전송
  - 트랜잭션 receipt 확인

Step 4: Peer ID 생성
  - DRB-node의 peer_id_generator 바이너리 실행
  - leadernode.bin, regularnode1.bin 생성
  - Leader Peer ID 추출

Step 5: Docker Compose 파일 생성
  - 템플릿에서 환경변수 치환
  - docker-compose.yml 작성

Step 6: Leader 노드 시작
  - docker compose up -d drb-leader-postgres drb-leader
  - Health check 대기 (nc -z localhost 9600)
  - 최대 60초 대기, 실패 시 abort

Step 7: Regular 노드 시작
  - docker compose up -d drb-regular-postgres drb-regular-1
  - Health check 대기
  - deposit() 트랜잭션 확인 (로그 모니터링)
  - activate() 트랜잭션 확인
  - Leader registration 확인

Step 8: 상태 업데이트
  - Integration status → INSTALLED
  - Integration metadata에 Leader Peer ID, 노드 수, 포트 등 저장
```

### 6.8 에러 처리

| 실패 지점 | 처리 |
|----------|------|
| L2 health check 실패 | DRB 설치 스킵, status=FAILED, 재시도 가능 |
| 컨트랙트 검증 실패 | DRB 설치 스킵, status=FAILED, genesis 문제 로그 |
| 펀딩 실패 (잔고 부족) | DRB 설치 스킵, status=FAILED, 잔고 부족 에러 메시지 |
| Peer ID 생성 실패 | DRB 설치 스킵, status=FAILED |
| Leader 시작 실패 | 컨테이너 정리, status=FAILED |
| Regular 시작 실패 | Regular 컨테이너 정리, Leader는 유지, status=PARTIAL |
| Docker image pull 실패 | DRB 설치 스킵, status=FAILED, 네트워크 에러 메시지 |

### 6.9 Regular 노드 추가 플로우

```
사용자: "Add Regular Node" 클릭
    │
    ├─ 1. 다음 index에서 키 파생 (현재 regular 수 + 5 + 1)
    ├─ 2. Admin → 새 Regular 계정에 TON 전송
    ├─ 3. 새 Peer ID 생성
    ├─ 4. Docker Compose에 서비스 추가 (또는 별도 compose)
    ├─ 5. Regular 노드 컨테이너 시작
    ├─ 6. deposit + activate + leader registration 확인
    └─ 7. Integration metadata 업데이트 (노드 수 증가)
```

---

## 7. Open Questions

| # | Question | Owner | Deadline |
|---|----------|-------|----------|
| 1 | `Commit2RevealDRB`의 `flatFee` 값은 얼마로 설정할 것인가? | DRB-node Team | Sprint 시작 전 |
| 2 | Predeploy 주소 번호는 `0x4200...0202`로 확정 가능한가? trh-sdk genesis builder에서 커스텀 predeploy를 지원하는가? | trh-sdk Team | Sprint 1 |
| 3 | Peer ID 생성을 Docker 이미지 내부에서 처리할 수 있는가? (현재는 별도 Go 바이너리 빌드 필요) | DRB-node Team | Sprint 1 |
| 4 | DRB-node Docker Hub CD workflow 구축 일정은? (현재 소스 빌드만 가능) | DRB-node Team | Sprint 시작 전 |
| 5 | AWS Helm Chart 구조 설계 — Leader/Regular를 하나의 Chart로 관리할 것인가, 분리할 것인가? | trh-sdk Team | Sprint 2 시작 전 |
| 6 | DRB 컨트랙트의 `maxActivatedOperators` 기본값 100이 적절한가? | DRB-node Team | Sprint 시작 전 |
| 7 | L2 genesis에서 Admin 계정에 prefund되는 TON 양이 DRB 노드 펀딩에 충분한가? 최소 요구 잔고 기준은? | trh-sdk Team | Sprint 1 |
| 8 | `Commit2RevealDRB` 컨트랙트가 genesis predeploy로 배포될 때, constructor가 실행되지 않는 OP Stack 제약이 있는가? (storage slot 직접 설정 필요 여부) | trh-sdk Team | Sprint 1 |

---

## 8. Timeline & Phasing

### Phase 1: 로컬 인프라 자동 설치 (4주)

**Sprint 1 (2주):**
- `Commit2RevealDRB` genesis predeploy 통합 (trh-sdk + trh-backend)
- BIP44 index 5+ 키 파생 로직 추가 (`seed_accounts.go`)
- DRB Docker Compose 템플릿 생성 (`deployment.go`)
- Peer ID 생성 자동화

**Sprint 2 (2주):**
- DRB 부트스트랩 시퀀스 구현 (계정 펀딩 → Leader 시작 → Regular 시작)
- 에러 처리 및 상태 관리
- DRB 재설치 기능
- E2E 테스트 (로컬 프리셋 배포 → DRB 자동 설치 → 첫 라운드 완료)

### Phase 2: Regular 노드 추가 + UI (2주)

**Sprint 3 (2주):**
- Regular 노드 추가 API 및 UI
- DRB 노드 상태 조회 API 및 UI
- Integration 테스트

### Phase 3: AWS 인프라 지원 (4주)

**Sprint 4-5 (4주):**
- `tokamak-thanos-stack`에 DRB Helm Chart 개발
- `trh-sdk`에서 DRB Helm Chart 실행 지원
- EC2 provisioning + Docker Compose 배포 자동화
- AWS E2E 테스트

### Dependencies

```
Phase 1 blockers:
  ├─ DRB-node Docker Hub CD workflow 구축 (DRB-node Team)
  ├─ trh-sdk genesis builder에 커스텀 predeploy 지원 확인 (trh-sdk Team)
  └─ flatFee, predeploy 주소 등 설정값 확정 (DRB-node Team)

Phase 3 blockers:
  ├─ Phase 1 완료
  ├─ tokamak-thanos-stack Helm Chart 설계 완료
  └─ trh-sdk Helm 실행 인터페이스 설계 완료
```

---

## Appendix: DRB Node 환경변수 전체 목록

### Leader Node

| 변수 | 값 | 소스 |
|------|-----|------|
| NODE_TYPE | leader | 고정 |
| LEADER_PRIVATE_KEY | Admin private key | seed phrase index 0 |
| LEADER_PORT | 9600 | 고정 (로컬) |
| CONTRACT_ADDRESS | Predeploy 주소 | genesis 설정 |
| CHAIN_ID | L2 Chain ID | 배포 설정 |
| ETH_RPC_URLS | http://host.docker.internal:9545 | L2 RPC |
| POSTGRES_HOST | drb-leader-postgres | Docker service name |
| POSTGRES_PORT | 5432 | 고정 |
| POSTGRES_USER | postgres | 고정 |
| POSTGRES_PASSWORD | (자동 생성) | 배포 시 생성 |
| POSTGRES_NAME | drbnode | 고정 |

### Regular Node

| 변수 | 값 | 소스 |
|------|-----|------|
| NODE_TYPE | regular | 고정 |
| EOA_PRIVATE_KEY | 파생된 private key | seed phrase index 5+ |
| PORT | 9601+ | 노드 번호에 따라 증가 |
| LEADER_IP | drb-leader | Docker service name |
| LEADER_PORT | 9600 | Leader 포트 |
| LEADER_PEER_ID | (자동 생성) | Peer ID 생성 |
| CONTRACT_ADDRESS | Predeploy 주소 | genesis 설정 |
| CHAIN_ID | L2 Chain ID | 배포 설정 |
| ETH_RPC_URLS | http://host.docker.internal:9545 | L2 RPC |
| POSTGRES_HOST | drb-regular-postgres | Docker service name |
| POSTGRES_PORT | 5432 | 고정 |
| POSTGRES_USER | postgres | 고정 |
| POSTGRES_PASSWORD | (자동 생성) | 배포 시 생성 |
| POSTGRES_NAME | drbnode | 고정 |
