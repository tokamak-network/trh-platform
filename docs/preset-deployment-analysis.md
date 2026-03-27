# Preset Deployment Analysis: Code vs Spec

## 1. 개요

### 분석 목적

TRH Platform의 4개 Preset(General, DeFi, Gaming, Full)에 대해 스펙 문서와 실제 구현 코드 간의 정합성을 검증한다. 불일치 항목을 식별하고 severity를 부여하여 수정 우선순위를 제시한다.

### 분석 대상

| 구분 | 소스 | 경로 |
|------|------|------|
| 스펙 | HTML 디자인 문서 | `docs/preset-deployment-flow.html` |
| 코드 | Go preset service | `trh-backend/pkg/services/thanos/presets/service.go` |
| 배포 | Docker Compose 템플릿 | `trh-sdk/pkg/stacks/thanos/templates/local-compose.yml.tmpl` |
| 자동설치 | Deployment service | `trh-backend/pkg/services/thanos/deployment.go` |

### 분석 일자

2026-03-27

---

## 2. Preset별 비교 결과

### 2.1 General Preset

**판정: 일치**

#### 모듈 구성

| 모듈 | 스펙 | 코드 | 일치 |
|------|------|------|------|
| Bridge | on | on | O |
| Block Explorer | on | on | O |
| Monitoring | off | off | O |
| Cross Trade | off | off | O |
| Uptime Service | off | off | O |
| DRB | (미기재) | (없음) | O |

#### 체인 설정

| 파라미터 | 스펙 | 코드 | 일치 |
|----------|------|------|------|
| BatchFreq | 1800s | 1800s | O |
| OutputFreq | 1800s | 1800s | O |
| ChallengePeriod | 86400s | 86400s | O |
| Backup | off | false | O |
| RegisterCandidate | off | false | O |

#### Genesis Predeploys

- 스펙: L1Block, L2ToL1Passer, L2StandardBridge, GasPriceOracle, +9 OP Standard
- 코드: OP Standard 13개 (L1Block, L2ToL1MessagePasser, L2StandardBridge, GasPriceOracle, SchemaRegistry, EAS 등)
- 참고: 스펙에서 "+9 OP Standard"로 표기한 것은 명시적 4개 + 나머지 9개 = 총 13개와 일치

---

### 2.2 DeFi Preset

**판정: 일치**

#### 모듈 구성

| 모듈 | 스펙 | 코드 | 일치 |
|------|------|------|------|
| Bridge | on | on | O |
| Block Explorer | on | on | O |
| Monitoring | on | on | O |
| Cross Trade | off | off | O |
| Uptime Service | on | on | O |
| DRB | (미기재) | (없음) | O |

#### 체인 설정

| 파라미터 | 스펙 | 코드 | 일치 |
|----------|------|------|------|
| BatchFreq | 900s | 900s | O |
| OutputFreq | 900s | 900s | O |
| ChallengePeriod | 86400s | 86400s | O |
| Backup | on | true | O |
| RegisterCandidate | off | false | O |

#### Genesis Predeploys

- 스펙: +13 OP Standard, UniswapV3Factory, SwapRouter, PositionManager, USDCBridge, WrappedETH
- 코드: OP Standard 13개 + Uniswap x3 (Factory, SwapRouter, NonfungiblePositionManager) + USDCBridge + WrappedETH
- 일치 확인

---

### 2.3 Gaming Preset

**판정: 부분 일치 (WARNING)**

#### 모듈 구성

| 모듈 | 스펙 | 코드 | 일치 |
|------|------|------|------|
| Bridge | on | on | O |
| Block Explorer | on | on | O |
| Monitoring | on | on | O |
| Cross Trade | on | on | O |
| Uptime Service | on | on | O |
| DRB | (미기재) | **on** | **X** |

#### 체인 설정

| 파라미터 | 스펙 | 코드 | 일치 |
|----------|------|------|------|
| BatchFreq | 300s | 300s | O |
| OutputFreq | 600s | 600s | O |
| ChallengePeriod | 86400s | 86400s | O |
| Backup | on | true | O |
| RegisterCandidate | off | false | O |

#### Genesis Predeploys

- 스펙: +13 OP Standard, VRF, VRFCoordinator, AA EntryPoint, Paymaster
- 코드: OP Standard 13개 + VRF + VRFCoordinator + EntryPoint + Paymaster
- 일치 확인

#### 불일치 상세

코드에서 `drb: true`가 설정되어 있으며, Docker Compose 배포 시 `drb-leader` 및 `drb-postgres` 컨테이너가 추가 생성된다. HTML 스펙 문서에는 DRB 모듈이 언급되지 않는다.

---

### 2.4 Full Preset

**판정: 불일치 (CRITICAL)**

#### 모듈 구성

| 모듈 | 스펙 | 코드 | 일치 |
|------|------|------|------|
| Bridge | on | on | O |
| Block Explorer | on | on | O |
| Monitoring | on | on | O |
| Cross Trade | on | on | O |
| Uptime Service | on | on | O |
| DRB | (미기재) | **on** | **X** |

#### 체인 설정

| 파라미터 | 스펙 | 코드 | 일치 |
|----------|------|------|------|
| BatchFreq | 600s | 600s | O |
| OutputFreq | 600s | 600s | O |
| ChallengePeriod | 86400s | 86400s | O |
| Backup | on | true | O |
| **RegisterCandidate** | **on** | **false** | **X** |

#### Genesis Predeploys

- 스펙: +13 OP Standard, UniswapV3Factory, USDCBridge, VRF, AA EntryPoint, Paymaster, +4 more
- 코드: OP Standard 13개 + VRF + VRFCoordinator + EntryPoint + Paymaster + Uniswap x3 + USDCBridge + WrappedETH
- "+4 more"는 SwapRouter, PositionManager, VRFCoordinator, WrappedETH에 해당하므로 일치

#### 불일치 상세

1. **RegisterCandidate (CRITICAL)**: 스펙에서는 `on`으로 명시되어 있으나, 코드에서는 `registerCandidate: false`로 설정되어 있다. Full preset은 모든 기능을 활성화하는 것이 목적이므로 RegisterCandidate도 `true`여야 한다.
2. **DRB 모듈 (WARNING)**: Gaming preset과 동일하게 코드에 `drb: true`가 존재하지만 스펙에 미기재.

---

## 3. 불일치 항목 요약

### CRITICAL

| # | Preset | 항목 | 스펙 값 | 코드 값 | 영향 |
|---|--------|------|---------|---------|------|
| 1 | Full | RegisterCandidate | `on` | `false` | Full preset 배포 시 candidate 등록이 누락되어 TON staking 기반 sequencer 선출 메커니즘이 비활성화됨 |

### WARNING

| # | Preset | 항목 | 설명 |
|---|--------|------|------|
| 2 | Gaming | DRB 모듈 | 코드에 `drb: true` 존재, Docker Compose에 `drb-leader` + `drb-postgres` 컨테이너 배포됨. 스펙 문서에 DRB 미기재 |
| 3 | Full | DRB 모듈 | 위와 동일. Full preset도 코드에서 DRB를 활성화하지만 스펙에 미반영 |

### INFO

| # | Preset | 항목 | 설명 |
|---|--------|------|------|
| 4 | General | OP Standard count | 스펙에서 "4개 명시 + 9 OP Standard"로 표기하나 실제 코드는 항상 13개 predeploy를 배포. DeFi/Gaming/Full 스펙에서는 "+13 OP Standard"로 정확히 표기되어 있으므로, General 스펙의 표기 방식만 상이 |

---

## 4. 일치 항목 요약

다음 항목들은 4개 preset 전체에서 코드와 스펙이 일치함을 확인했다:

### 타이밍 파라미터

- General: BatchFreq=1800s, OutputFreq=1800s
- DeFi: BatchFreq=900s, OutputFreq=900s
- Gaming: BatchFreq=300s, OutputFreq=600s
- Full: BatchFreq=600s, OutputFreq=600s

### 모듈 구성 (DRB 제외)

- Bridge: General/DeFi/Gaming/Full 모두 `on`
- Block Explorer: General/DeFi/Gaming/Full 모두 `on`
- Monitoring: General=`off`, DeFi/Gaming/Full=`on`
- Cross Trade: General/DeFi=`off`, Gaming/Full=`on`
- Uptime Service: General=`off`, DeFi/Gaming/Full=`on`

### Predeploys

- OP Standard 13개: 모든 preset에 공통 배포 확인
- DeFi predeploys: UniswapV3Factory, SwapRouter, NonfungiblePositionManager, USDCBridge, WrappedETH
- Gaming predeploys: VRF, VRFCoordinator, EntryPoint (AA), Paymaster
- Full predeploys: DeFi + Gaming predeploys 합집합

### 기타 설정

- Backup: General=`off`, DeFi/Gaming/Full=`on`
- Fee token: 모든 preset에서 사용자 선택 가능 (ETH/TON)
- ChallengePeriod: 모든 preset에서 86400s (24h)

---

## 5. 권장 조치

### CRITICAL-1: Full preset RegisterCandidate 수정

**파일**: `trh-backend/pkg/services/thanos/presets/service.go`
**조치**: Full preset의 `registerCandidate` 값을 `false`에서 `true`로 변경
**근거**: 스펙 문서에서 Full Suite는 "데모, 스테이징, 관리형 환경을 위한 전체 구성"으로 정의되며, RegisterCandidate=`on`이 명시되어 있음. Full preset은 모든 기능이 활성화되어야 하므로 코드 수정이 필요.
**우선순위**: 높음 - 배포 결과에 직접 영향

### WARNING-2,3: DRB 모듈 스펙 문서 보완

**파일**: `docs/preset-deployment-flow.html`
**조치**: Gaming 및 Full preset 카드에 DRB 모듈 항목 추가 (mod-on 상태)
**근거**: 코드에 이미 구현되어 있고 Docker Compose로 실제 배포되는 기능이므로, 스펙 문서에 반영하여 코드-스펙 간 정합성을 확보해야 함.
**우선순위**: 중간 - 기능은 정상 동작하지만 문서가 불완전

### INFO-4: General preset OP Standard 표기 통일

**파일**: `docs/preset-deployment-flow.html`
**조치**: General preset의 "+9 OP Standard" 표기를 "+13 OP Standard"로 통일하거나, 명시적 4개를 제거하고 "+13 OP Standard"로 일괄 표기
**근거**: DeFi/Gaming/Full은 "+13 OP Standard"로 표기하는 반면 General만 "4개 명시 + 9개 나머지"로 표기하여 혼동 유발. 실제 배포되는 predeploy 수는 모두 동일하게 13개.
**우선순위**: 낮음 - 표기 방식의 일관성 문제

---

## 부록: 분석 방법론

- HTML 스펙 파일에서 각 preset 카드의 모듈 상태(`mod-on`/`mod-off`), 체인 설정(`cfg-val`), predeploy 목록(`pill`)을 파싱
- Go 소스 코드에서 각 preset의 `PresetConfig` 구조체 값을 추출하여 1:1 비교
- Docker Compose 템플릿에서 조건부 서비스 배포 로직 확인 (DRB 컨테이너 등)
- 실제 Electron 앱을 통한 배포 테스트는 수행하지 않음 (코드 레벨 분석)
