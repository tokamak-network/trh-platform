# Preset 비교: L2 체인 배포 로직 및 설치 서비스

TRH Platform은 4가지 Preset을 제공한다. 각 Preset은 목적에 맞게 L2 체인 파라미터, Genesis Predeploy 컨트랙트, 활성화 모듈이 다르게 구성된다.

> **소스**: `tests/fixtures/presets.json`, `tests/e2e/helpers/matrix-config.ts`

---

## 1. Preset 개요

| Preset | ID | 설명 | 예상 배포 시간 |
|--------|----|------|--------------|
| **General Purpose** | `general` | 범용 표준 롤업. 기본 Bridge + Block Explorer만 포함 | 20–30분 |
| **DeFi** | `defi` | 거래소·유동성·결제 워크로드 특화. CrossTrade 포함 | 30–40분 |
| **Gaming** | `gaming` | 높은 처리량과 플레이어 관찰성 최적화. DRB + AA 포함 | 35–45분 |
| **Full Suite** | `full` | 모든 모듈 활성화. 데모/스테이징/고급 관리 환경용 | 40–50분 |

공통 Funding Wait: **5–15분** (L1 펀딩 완료 대기)

---

## 2. L2 체인 파라미터 비교

| 파라미터 | General | DeFi | Gaming | Full |
|----------|---------|------|--------|------|
| `l2BlockTime` (초) | 2 | 2 | 2 | 2 |
| `batchSubmissionFrequency` (초) | 1800 | 900 | **300** | 600 |
| `outputRootFrequency` (초) | 1800 | 900 | 600 | 600 |
| `challengePeriod` (초) | 12 | 12 | 12 | 12 |
| `backupEnabled` | ❌ | ✅ | ✅ | ✅ |
| `registerCandidate` | ❌ | ❌ | ❌ | ❌ |

**포인트:**
- Gaming은 `batchSubmissionFrequency`가 300초로 가장 짧다 → 높은 처리량에 적합
- General은 `backupEnabled`가 꺼져 있어 가장 가벼운 구성

### 사용자 정의 가능한 필드 (overridableFields)

| 필드 | General | DeFi | Gaming | Full |
|------|---------|------|--------|------|
| `l2BlockTime` | ✅ | ❌ | ✅ | ✅ |
| `batchSubmissionFrequency` | ✅ | ✅ | ✅ | ✅ |
| `outputRootFrequency` | ✅ | ✅ | ✅ | ✅ |
| `challengePeriod` | ✅ | ✅ | ❌ | ✅ |
| `backupEnabled` | ✅ | ❌ | ❌ | ❌ |

---

## 3. Genesis Predeploy 컨트랙트

L2 체인 Genesis 블록에 사전 배포되는 컨트랙트 목록이다.

### 공통 (OP Standard) — 모든 Preset 포함 (13개)

| 컨트랙트 | 역할 |
|---------|------|
| `L2ToL1MessagePasser` | L2 → L1 메시지 전달 |
| `L2CrossDomainMessenger` | 크로스도메인 메시지 릴레이 |
| `L2StandardBridge` | ERC20/ETH 브릿지 (L2 측) |
| `L2ERC721Bridge` | ERC721 브릿지 (L2 측) |
| `OptimismMintableERC20Factory` | 브릿지 ERC20 토큰 팩토리 |
| `OptimismMintableERC721Factory` | 브릿지 ERC721 토큰 팩토리 |
| `L1Block` | L1 블록 정보 제공 |
| `GasPriceOracle` | L2 가스 가격 오라클 |
| `SequencerFeeVault` | 시퀀서 수수료 수취 |
| `BaseFeeVault` | Base fee 수취 |
| `L1FeeVault` | L1 data fee 수취 |
| `SchemaRegistry` | EAS 스키마 레지스트리 |
| `EAS` | Ethereum Attestation Service |

### DeFi 추가 (5개) — `defi`, `full` Preset

| 컨트랙트 | 역할 |
|---------|------|
| `UniswapV3Factory` | Uniswap V3 풀 생성 |
| `UniswapV3SwapRouter` | Uniswap V3 스왑 라우터 |
| `UniswapV3NonfungiblePositionManager` | 유동성 포지션 NFT 관리 |
| `USDCBridge` | USDC 전용 브릿지 |
| `WrappedETH` | WETH 컨트랙트 |

### Gaming 추가 (7개) — `gaming`, `full` Preset

**DRB (Decentralized Random Beacon) 관련 (3개):**

| 컨트랙트 | 주소 | 역할 |
|---------|------|------|
| `VRF` | `0x4200000000000000000000000000000000000200` | dApp facing 온체인 랜덤성 인터페이스 |
| `VRFCoordinator` | `0x4200000000000000000000000000000000000201` | VRF 요청 조율 컨트랙트 |
| `DRB` | `0x4200000000000000000000000000000000000060` | DRB 온체인 상태 관리 |

> **현재 연동 상태**: VRF/VRFCoordinator ↔ DRB 간 온체인 연동 미구현. `Commit2RevealDRB` 컨트랙트(`0x...0202` 예정)로 교체 계획 중.

**AA (Account Abstraction) 관련 (4개):**

| 컨트랙트 | 주소 | 역할 |
|---------|------|------|
| `EntryPoint` | `0x4200000000000000000000000000000000000063` | ERC-4337 v0.8 AA EntryPoint |
| `SimplePriceOracle` | `0x4200000000000000000000000000000000000066` | MultiTokenPaymaster용 토큰 가격 오라클 |
| `MultiTokenPaymaster` | `0x4200000000000000000000000000000000000067` | AA 가스 대납 Paymaster (다중 토큰 지원) |
| `Simple7702Account` | `0x4200000000000000000000000000000000000068` | EIP-7702 delegation target |

### Preset별 컨트랙트 수 요약

| Preset | OP Standard | DeFi 추가 | Gaming 추가 | 합계 |
|--------|------------|-----------|------------|------|
| General | 13 | — | — | **13** |
| DeFi | 13 | 5 | — | **18** |
| Gaming | 13 | — | 7 | **20** |
| Full | 13 | 5 | 7 | **25** |

---

## 4. 활성화 모듈

배포 후 자동으로 설치되는 서비스 모듈이다.

| 모듈 | General | DeFi | Gaming | Full |
|------|---------|------|--------|------|
| **Bridge** | ✅ | ✅ | ✅ | ✅ |
| **Block Explorer** | ✅ | ✅ | ✅ | ✅ |
| **Monitoring** (Grafana) | ❌ | ✅ | ✅ | ✅ |
| **Uptime Service** (Uptime Kuma) | ❌ | ✅ | ✅ | ✅ |
| **CrossTrade** | ❌ | ✅ | ❌ | ✅ |
| **DRB** (Decentralized Random Beacon) | ❌ | ❌ | ✅ | ✅ |

**모듈 설명:**
- **Bridge**: L1 ↔ L2 자산 이동 UI (tokamak-bridge)
- **Block Explorer**: L2 블록 탐색기 (Blockscout 기반)
- **Monitoring**: Grafana 대시보드 (시퀀서·노드 지표)
- **Uptime Service**: Uptime Kuma 가용성 모니터링
- **CrossTrade**: L1-L2 / L2-L2 크로스체인 거래 dApp (port 3004)
- **DRB**: 게임용 온체인 난수 생성 서비스

---

## 5. Docker 서비스 구성

### 기본 서비스 — 모든 Preset 공통

| 서비스 | 이미지 | 포트 | 역할 |
|--------|--------|------|------|
| `postgres` | `postgres:15` | 5433 | 플랫폼 DB |
| `backend` | `tokamaknetwork/trh-backend:latest` | 8000 | API 서버 |
| `platform-ui` | `tokamaknetwork/trh-platform-ui:latest` | 3000 | 관리 대시보드 |

### CrossTrade 서비스 — `defi`, `full` Preset

`docker-compose.crosstrade.yml`로 추가 기동된다.

| 서비스 | 역할 | 조건 |
|--------|------|------|
| `crosstrade-dapp` | CrossTrade dApp (port 3004) | crossTrade 모듈 활성화 시 |
| `aa-operator` | AA Paymaster 리필 오퍼레이터 | Fee Token이 TON이 아닌 경우 |

> L2 체인 노드(시퀀서, 배처, 프로포저 등)는 백엔드가 동적으로 관리하며 `docker-compose.yml` 외부에서 프로비저닝된다.

---

## 6. Fee Token & Account Abstraction (AA)

모든 Preset에서 4가지 Fee Token을 지원하지만, TON 이외 토큰 선택 시 AA 인프라가 추가로 필요하다.

| Fee Token | 네이티브 | Paymaster 필요 | AA Operator 필요 | Paymaster 마크업 |
|-----------|---------|--------------|----------------|----------------|
| **TON** | ✅ | ❌ | ❌ | — |
| **ETH** | ❌ | ✅ | ✅ | 5% |
| **USDT** | ❌ | ✅ | ✅ | 3% |
| **USDC** | ❌ | ✅ | ✅ | 3% |

- TON: L2 네이티브 가스 토큰. Paymaster 없이 직접 사용
- ETH/USDT/USDC: ERC-4337 Paymaster로 가스 대납, `aa-operator` 서비스가 Paymaster 잔액 자동 리필

---

## 7. Preset 선택 가이드

| 상황 | 권장 Preset |
|------|------------|
| 단순 롤업 테스트, 최소 구성 | `general` |
| DEX, 유동성 풀, USDC 브릿지 필요 | `defi` |
| 게임 dApp, 난수(VRF), AA 지갑 | `gaming` |
| 전체 기능 검증, 데모, 스테이징 | `full` |
