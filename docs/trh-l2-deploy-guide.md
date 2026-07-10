# TRH Desktop App — Full Preset L2 배포 가이드 (Local + AWS)

> **범위:** 배포 타깃 = Local Docker + AWS(EKS) · Preset = **Full**(CrossTrade + DRB + AA Paymaster) · 진입점 = **trh-platform Desktop App**
> **근거:** `tokamak-network/trh-wiki` + 코드 직접 확인(`trh-sdk`, `tokamak-thanos-stack`, 2026-07-09)
> **표기:** ⚠️ = 코드로 미확정, 본문에서 확인 필요 지점

---

## 0. 개요

### 0.1 아키텍처 체인
Desktop App이 최종적으로 trh-sdk를 호출하기까지의 경로:

```
trh-platform (Electron shell)
  └─ 임베디드 UI (Next.js, trh-platform-ui)
       └─ HTTP → trh-backend (Gin + GORM, localhost:8000)
            └─ trh-sdk (Go module로 직접 import, exec 아님)
                 ├─ DeployContracts → Foundry (L1)
                 └─ Deploy → Docker Compose(Local) / Terraform+Helm(AWS)
```

trh-backend은 로컬(Desktop App 내부)에서 돌고, AWS 배포도 이 로컬 백엔드가 오케스트레이션한다. 즉 **관리 API는 항상 `localhost:8000`**, 배포되는 L2 서비스만 Local/AWS로 갈린다.

### 0.2 Full Preset 구성
Full은 다음을 모두 포함한다: 베이스 L2 + Bridge + Block Explorer + Monitoring + System Pulse + **CrossTrade** + **DRB VRF** + **AA Paymaster**.

### 0.3 배포 모델
L1 컨트랙트는 Local/AWS 공통으로 실제 Sepolia(또는 Mainnet)에 배포된다. 차이는 **L2 노드 위치**뿐이다.

| 항목 | Local | AWS |
|---|---|---|
| L2 노드 | Docker Compose (localhost) | EKS 파드 |
| 인프라 | Docker | Terraform(VPC/EKS/EFS) + Helm |
| Network | Testnet 전용 | Testnet + Mainnet |
| 모듈 설치 | compose profile로 **자동** | `trh-sdk install <module>` **수동** |
| 비용 | 무료 | EC2/EKS/EFS/ELB 비용 |

### 0.4 네이밍 주의
AWS 경로의 route/파일명 `ec2-deploy`·`deploy-aws-infra`는 역사적 이름이며 **실제 컴퓨트는 EC2가 아니라 EKS 파드**다. SSH/user-data 없이 100% Helm chart로 배포된다.

---

## 1. 사전 요구사항

### 1.1 공통
- OS: macOS 13+ 또는 Ubuntu 22.04+
- 12단어 BIP39 Seed Phrase (Sepolia ETH 보유)
- L1 RPC URL (Alchemy 등) + L1 Beacon URL (publicnode 등)
- Seed에서 파생되는 3개 계정 최소 잔액: **Admin 0.5+, Batcher 0.3+, Proposer 0.3+ ETH** (Funding 미달 시 배포 버튼 비활성)

### 1.2 Local 전용
- Docker Desktop 4.x 실행 중
- 디스크 20GB+
- 포트 가용: 8545 / 8546 / 8548 / 8551 / 8560 / 9545 (+ DRB regular 포트)

### 1.3 AWS 전용
- IAM access key/secret **또는** SSO 로그인 (Electron이 temp creds로 변환해 주입)
- 권한: EC2 / EKS / IAM / VPC / EFS / S3 / DynamoDB / ELB 생성 가능
- 백엔드 검증: 배포 요청 시 `IsAvailableRegion`이 **live STS/EC2 ping**으로 자격증명·리전을 실검증함

---

### 1.4 Mainnet 배포 시 추가 주의 (AWS 전용)
Local은 Testnet(Sepolia) 고정이므로 Mainnet은 **AWS 경로에서만** 가능하다(`deploy_contracts.go`가 network∈{LocalDevnet,Testnet,Mainnet}만 허용, Local=Testnet).
- L1 = Ethereum Mainnet(chainID 1). 컨트랙트 배포·배치·제안 트랜잭션이 **실제 ETH 가스**를 소모하므로 Admin/Batcher/Proposer 잔액을 Mainnet 기준으로 재산정할 것(위 1.1 최소치는 Sepolia 기준).
- `challengePeriod`, `outputRootFrequency` 등 실값이 Testnet과 다르게 설정되어야 하며, 잘못 잡으면 자금이 묶이거나 fraud 대응 창이 부족해질 수 있음 — 배포 전 파라미터를 반드시 직접 검토.
- 워크로드 컨테이너 이미지 태그는 `constants/docker_images.go`에 **고정**되어 있고 현재 Testnet/Mainnet 동일 태그를 사용(OpGeth `nightly`, ThanosStack/DRBNode는 커밋 SHA 핀). 즉 SDK 코드는 main HEAD를 따르지만 **L2 노드 이미지는 핀된 태그**라는 점에 유의(§ 스냅샷 주의 참조).

---

## 2. 핵심 개념 (빠른 참조)

### 2.1 키 파생 (BIP44)
Seed 1개 → 결정적 파생:
- Admin(L1 owner) / Batcher / Proposer / Deployer
- **DRB Regular 3키**: `m/44'/60'/0'/0/{5,6,7}`
- Leader/Regular libp2p peer ID: `sha256(mnemonic + "|drb-peer-id-v1|" + role)` 시드 기반 (결정적)

### 2.2 L2 노드 구성
| 컨테이너 | 포트 | 역할 |
|---|---|---|
| op-geth | 8545/8546/8551 | L2 실행 레이어 |
| op-node | 9545/7300 | 롤업 노드(L1 동기화) |
| op-batcher | 8548 | L2 배치 → L1 제출 |
| op-proposer | 8560 | 상태 루트 → L1 제출 |

### 2.3 Full 추가 컨테이너/워크로드
CrossTrade dApp, drb-leader, drb-regular-{1,2,3}, drb-postgres 계열, AA Paymaster.

---

## 3. 배포 준비 (Desktop App 위저드)

1. Sidebar → **Rollup → Create New Rollup → Preset Wizard**
2. **Basic Info**
   - **Infrastructure Provider** 선택 → 여기서 Local/AWS 결정
     - Local 선택 시: AWS Configuration 섹션 숨김, Network가 Testnet(Sepolia)로 고정
     - AWS 선택 시: AWS Configuration(accessKey/secretKey/region 또는 SSO temp creds) 노출
   - **Preset = Full**
3. 파라미터: Chain Name, Network, L1 RPC/Beacon URL, FeeToken, Seed Phrase
4. **Config Review**: Expert Mode로 파라미터 조정 가능, **Funding Status** 3계정 잔액 통과 확인 → Deploy 활성

> Under the hood: Local은 `POST /api/v1/stacks/thanos/preset-deploy`, AWS는 `POST /api/v1/stacks/thanos`(admin JWT) 요청이 나가고, backend가 `deploy-l1-contracts` → `deploy-aws-infra`(local 분기 포함) 2단계를 in-process goroutine으로 순차 실행한다.

---

## 4. 배포 실행 — 타깃 분기

### 공통 선행: L1 컨트랙트 + genesis
두 경로 모두 먼저 **DeployContracts**(Foundry `start-deploy.sh`)로 Sepolia에 `OptimismPortal`, `SystemConfig`, `L2OutputOracle`, `AnchorStateRegistry` 등을 배포하고 `genesis.json`/`rollup.json`을 생성한다.

이 단계에서 **DRB genesis 주입도 함께 일어난다** — `deploy_contracts.go`의 `maybeInjectDRB`/`maybeFundDRBRegulars`가 **preset으로만 게이팅**(infra provider 무관)되어 predeploy `0x4200…0060`(impl+proxy slot)과 Regular 잔액을 `genesis.json`에 patch한다. 즉 **genesis 주입은 Local/AWS 동일하게 Terraform/Helm 이전**이다.

### 4.A Local Docker 경로
1. `deploy-l1-contracts` (Sepolia) — 위 공통 선행
2. `deploy-aws-infra`의 로컬 분기 → **Docker Compose**로 L2 노드 기동
3. op-geth → op-node → op-batcher → op-proposer 순차 부팅

### 4.B AWS(EKS) 경로
1. **자격증명 주입**: Electron이 SSO temp creds 또는 IAM key를 webview JS 글로벌(`window.__TRH_AWS_CREDENTIALS__`)로 주입 → UI가 요청 body에 실음. (백엔드 ENV/IPC 주입 아님)
2. **L1 컨트랙트 배포**: 공통 선행(Foundry)
3. **Terraform 2-stage** (bash 셸아웃, `.envrc` source 후):
   - Backend 부트스트랩: `terraform/backend` — S3(state) + DynamoDB(`terraform-lock`)
   - Main stack: `terraform/thanos-stack` — VPC / EKS / IAM / EFS / ALB Ingress + `thanos-stack-values.yaml` 렌더
4. **Kubeconfig + Helm 2-pass**:
   - `helm repo add thanos-stack https://tokamak-network.github.io/tokamak-thanos-stack`
   - Pass 1 (`enable_vpc=true`): PVC 먼저 생성 → `WaitPVCReady`
   - Pass 2 (`enable_deployment=true`): op-geth/op-node/op-batcher/op-proposer(+옵션 op-challenger) 파드 롤아웃
   - **2-pass 이유**: EFS PVC가 파드보다 먼저 Bound 되어야 op-geth 볼륨 마운트 실패를 피함
5. RPC URL 발견: `GetAddressByIngress` 폴링 → `http://<ingress-host>`

### 4.C Fault-proof 옵션 (배포 DTO `enableFaultProof`)
컨트랙트 배포 단계의 분기다. 기본값 off이며, 켜면 §4의 L1 배포 동작이 바뀐다.
- **off (기본)**: cannon prestate 빌드 스킵, op-challenger 미배포, 표준 `L2OutputOracle` 경로.
- **on**: `deploy_contracts.go`가 (1) `AnchorStateRegistry.sol`을 `setInitialAnchorState`로 패치, (2) **cannon prestate를 컨트랙트 배포 전에 빌드**, (3) Sepolia 사전배포 impl 재사용 대신 패치된 AnchorStateRegistry를 새로 배포, (4) **challenger operator 필수** — 없으면 "challenger operator is required for fault proof but was not found" 에러로 실패. AWS Helm은 이때 op-challenger 파드를 포함.
- 판단 포인트: PoC/개발이면 off로 배포 시간을 줄이고, Mainnet/보안 요구가 있으면 on + challenger 키/자금을 사전 준비. **fault-proof 관련 배포 실패는 wiki 트러블슈팅의 큰 축**(delayed-weth, asr-dgf-proxy, l2-output-oracle-uninitialized 등) → §8.

---

## 5. Full Preset 모듈 배포

> **선행 완료 사항**: DRB predeploy + Regular 잔액, AA predeploy는 4단계 genesis에서 이미 주입됨. 5장은 **노드 기동 + 온체인 활성화 + 토큰/모듈 설정**을 다룬다.
> **Local vs AWS 모듈 설치 (코드 확인)**: `installPresetModules`(deploy_chain.go:2548)가 preset 모듈을 deploy 말미에 자동 설치한다.
> - **uptimeService / monitoring / blockExplorer / DRB / aaPaymaster** → Local·AWS **모두 deploy 중 자동 설치** (K8s 가드 없음)
> - **CrossTrade** → `modules["crossTrade"] && K8s == nil` 가드로 **Local만 자동**. **AWS에서는 유일한 수동 단계**로, 배포 후 `POST /integrations/cross-trade`(또는 `trh-sdk install cross-trade`)로 설치
> - 즉 **AWS Full에서 수동 개입이 필요한 모듈은 CrossTrade 하나뿐**. DRB/AA Paymaster 포함 나머지는 자동. (AWS DRB/CrossTrade는 실패 시 `/integrations/{drb,cross-trade}/retrigger`로 재시도)

### 5.1 CrossTrade
- L1 Deposit Tx 방식: `OptimismPortal.depositTransaction()` → L2 컨트랙트 생성 → L1 `setChainInfo` 등록 → CrossTrade dApp 추가
- **Local**: deploy 중 자동(`installPresetModules`, K8s==nil). 재설치 시 `POST /integrations/cross-trade-local`(body 없음)
- **AWS**: 배포 후 수동 — `POST /integrations/cross-trade` → `InstallCrossChainBridge`. Body 스키마(trh-backend `dtos/cross_trade.go` 확인):
  - `mode`: `"l2_to_l1"` | `"l2_to_l2"` (required)
  - `projectID`: string (required)
  - `l1ChainConfig`: `{ rpc, chainId, privateKey, chainName, isDeployedNew, blockExplorerConfig?, crossTradeProxyAddress?, crossTradeAddress? }`
  - `l2ChainConfig`: `[{ rpc, chainId, privateKey, chainName, isDeployedNew, crossDomainMessenger, nativeTokenAddress, l1StandardBridgeAddress, l1USDCBridgeAddress, l1CrossDomainMessenger, crossTradeProxyAddress?, crossTradeAddress?, blockExplorerConfig? }]` (≥1)
  - CLI 대안: `trh-sdk install cross-trade --type {l2-to-l2|l2-to-l1}` (인터랙티브 프롬프트로 입력 수집). 증분 등록은 `--register-chain` / `--register-tokens`(상호 배타)

### 5.2 DRB 노드 기동 — 타깃별 상이

**5.2.A Local (Docker Compose, 2-phase boot)**
1. `drb-postgres`, `drb-postgres-regular-{1,2,3}` healthy 대기
2. `BootstrapDRBPeerIDFiles()` — peer ID 바이너리 파일을 static-key 볼륨에 주입
3. `drb-leader`, `drb-regular-{1,2,3}` 기동 → 전부 healthy 대기

**5.2.B AWS (별도 Helm 릴리스 `drb-vrf`)**
- `charts/drb-vrf` 차트를 독립 릴리스 `drb-vrf`로 `helm upgrade --install`
- 구조: leader + regular×3이 **각각 개별 `Deployment`(replicas:1)** + 전용 postgres `Deployment`/`Service` 페어. 개인키는 k8s `Secret`
- 설정은 `helm --set-string`: `contractAddress`=predeploy `0x4200…0060`, `chainID`, `ethRpcUrls`=L2RpcUrl, 노드별 privateKey/peerID/peerIDBytes(base64), regular 포트 9601/9602/9603
- **호출 전제**: `K8s` config + live `L2RpcUrl`. Full 배포 시 `installPresetModules`가 deploy 말미에 **자동 호출**(수동 아님). 실패 시 `POST /integrations/drb/retrigger`로 재시도
- CLI 대안: `trh-sdk install drb-vrf` → `drb-leader-info.json` 생성(leader URL/peerID/contract 조회용)

### 5.3 DRB 온체인 활성화
- **Local**: trh-sdk 오케스트레이터가 외부에서 Regular 3키로 `depositAndActivate()`(결합형)를 순차 호출. genesis 상태에선 revert하므로 chain-live 후 실행. 코드: `local_network.go:1402` `ActivateRegularOperators`
- **AWS**: **별도 활성화 스텝 없음 — 노드가 자가 활성화한다.** `drb-vrf` 파드로 뜬 각 regular 노드가 부팅 핸들러 루프에서 자기 EOA 활성화 여부를 폴링하다가, 미활성화면 주입된 개인키로 `deposit`(부족분) → `activate` 2트랜잭션을 스스로 전송하고 leader에 등록 요청. 코드: `drb-node/nodes/regular/handler.go` (`checkActivationStatus` → `deposit` → `activateOnChain`)
- 두 경로 모두 최종 상태는 동일(`getActivatedOperators`에 Regular 3주소). 기동 순서상 AWS는 노드가 뜬 뒤 수 초~수십 초 내 자가 활성화되므로, 검증(6장)은 활성화 반영까지 잠시 폴링 필요

### 5.4 AA Paymaster (코드 확인)
AA predeploy 컨트랙트(`VerifyingPaymaster 0x…0064`, `MultiTokenPaymaster 0x…0067`, `Simple7702Account`)는 **모든 preset의 genesis에 포함**된다. 런타임 설정은 `setupAAPaymaster`(`aa_setup.go`)가 `installPresetModules`에서 Local·AWS 공통으로 자동 실행하되 **게이팅이 중요하다**:

- **`FeeToken == TON`(Full 기본값) → setup 전체 스킵.** predeploy만 존재, 별도 토큰 등록 없음. TON이 네이티브 가스 토큰이므로 paymaster 토큰 설정 불필요
- **`FeeToken == ETH / USDC / USDT` → setup 실행**:
  1. `EntryPoint.depositTo(MultiTokenPaymaster)` — 가스 스폰서용 fee token 예치
  2. `SimplePriceOracle.updatePrice(feeToken)` — 초기 가격 설정
  3. `MultiTokenPaymaster.addToken(token, oracle, markupPct, decimals)` — fee token 등록 (markup: ETH 5% / USDC·USDT 3%)
  4. 백그라운드 가격 업데이터(CoinGecko TON/feeToken) + EntryPoint 리필 모니터 → 장기 실행 서비스 `aa-operator`(`cmd/aa-operator`)가 담당
  - USDT는 L2 predeploy가 없어 Standard Bridge factory로 bridged USDT 배포(`deployBridgedUSDT`)
  - Admin EOA 코드 포인터를 `Simple7702Account` predeploy로 설정(EIP-7702)
- **검증**: `verifyAAPaymaster`가 3개 eth_call — `supportedTokens(token)` 활성, deposit 잔액, `SimplePriceOracle.getPrice() != 0`

> **Full + TON 조합에서 실무 함의**: AA Paymaster는 사실상 "genesis predeploy만 존재"하는 상태로 끝난다. 멀티토큰 가스 결제를 실제로 쓰려면 FeeToken을 non-TON으로 배포하거나, 배포 후 별도로 토큰을 등록해야 한다(현재 flow는 배포 시점 FeeToken 기준 1회 설정).

**aa-operator 서비스 lifecycle (non-TON 전용, 상시 실행 필요)**
non-TON fee token이면 위 4번의 가격 업데이터/EntryPoint 리필을 담당하는 **장기 실행 서비스 `aa-operator`가 계속 돌아야** 한다. 멈추면 `SimplePriceOracle` 가격이 stale 되어 paymaster 가격 산정이 깨진다. 실행 모드 2가지(코드 확인):
- **trh-backend 내 goroutine** (`RunAAOperatorFromConfig`) — Desktop App 경로의 권장 방식. backend 프로세스가 살아있는 동안 유지되므로, **Desktop App/백엔드를 종료하면 함께 멈춘다**는 점 주의.
- **독립 Docker Compose 서비스** (`cmd/aa-operator` 바이너리) — L2 스택 옆에 별도 컨테이너로 기동. env: `FEE_TOKEN`, `ADMIN_PRIVATE_KEY`, 선택 `COINGECKO_API_KEY`, `L2_RPC_URL`(기본 `host.docker.internal:8545`).
- TON fee token이면 aa-operator는 불필요.

---

## 6. 검증

```bash
# 1) 컨테이너/파드 상태
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"   # Local
kubectl get pods -n <namespace>                                   # AWS

# 2) L2 RPC 응답
curl -s -X POST <L2_RPC> -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'

# 3) 30초 후 블록 증가
curl -s -X POST <L2_RPC> -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```
- L2_RPC: Local `http://localhost:8545`, AWS `http://<ingress-host>`

**DRB 검증**
```bash
cast code 0x4200000000000000000000000000000000000060                 # predeploy 존재
cast call 0x4200...0060 "getActivatedOperators()(address[])" --rpc-url <L2_RPC>   # Regular 3주소
docker inspect drb-leader drb-regular-1 drb-regular-2 drb-regular-3   # Local healthy
# trh-sdk/scripts/drb_smoke.sh — 5초 내 전체 검증
```

**CrossTrade 검증**: L1↔L2 등록(setChainInfo) 반영 확인.

---

## 7. 배포 후 운영

> 관리 API는 `localhost:8000`. 먼저 JWT 발급 후 STACK_ID 확인.

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gmail.com","password":"admin"}' | jq -r '.token')

curl -s http://localhost:8000/api/v1/stacks/thanos \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | {id, chainName, status}'
```

### 7.1 통합 사후 설치 (General로 배포한 뒤 개별 추가 시)
```bash
# Bridge (body 없음)
curl -s -X POST .../stacks/thanos/{STACK_ID}/integrations/bridge -H "Authorization: Bearer $TOKEN"

# Block Explorer (Blockscout)
curl -s -X POST .../integrations/block-explorer -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"databaseUsername":"blockscout","databasePassword":"blockscout123",
       "coinmarketcapKey":"","coinmarketcapTokenId":"","walletConnectId":""}'
#   coinmarketcapKey 미설정 시 CoinGecko 자동 fallback (TON→tokamak-network, ETH→ethereum)

# Monitoring (Grafana + AlertManager) / System Pulse (body 없음)
curl -s -X POST .../integrations/monitoring ...   # grafanaPassword + alertManager(telegram/email)
curl -s -X POST .../integrations/system-pulse -H "Authorization: Bearer $TOKEN"

# CrossTrade (local 전용, body 없음)
curl -s -X POST .../integrations/cross-trade-local -H "Authorization: Bearer $TOKEN"
```

### 7.2 로컬 서비스 포트
L2 RPC `:8545` · Bridge `:3001` · Block Explorer `:4001` · Grafana `:3002` · Uptime Kuma `:3003`

### 7.3 Teardown
- Local: Dashboard → Stack → Delete → `docker compose down -v` (op-geth-data, blockscout-db-data 등 볼륨 제거)
- AWS: EKS destroy — `kubectl delete namespace` finalizer/EFS MT 정리 순서로 timeout 이슈가 있었으나, **self-heal 패턴으로 자동 복구**됨(아래 7.6)

### 7.4 업데이트 / L1 엔드포인트 교체
두 명령을 혼동하지 말 것 (코드 확인):
- **`trh-sdk update-network`** — 배포된 체인 대상. 입력은 `L1RPC` + `L1BeaconURL`. 값 YAML(`thanos-stack-values.yaml`, op-bridge, block-explorer)을 갱신하고 `constants`의 최신 이미지 태그(ThanosStack/OpGeth)로 맞춘 뒤 네임스페이스의 각 **helm release를 `helm upgrade`**. → L1 RPC/Beacon 로테이션이나 이미지 태그 반영에 사용.
- **`trh-sdk upgrade`** — **SDK 바이너리 자체**를 `go install …@latest`로 업그레이드. 배포된 체인과 무관. 이름 때문에 체인 업그레이드로 오해하기 쉬움.

### 7.5 백업 / 복원 (AWS 전용, EFS + AWS Backup)
배포 요청 body의 `"backupConfig":{"enabled":true}`로 활성화. EFS 볼륨을 AWS Backup으로 스냅샷한다. CLI(`trh-sdk backup …`) / backend API 양쪽 제공(코드 확인):

| 작업 | CLI 플래그 | backend 라우트 |
|---|---|---|
| 스냅샷 생성 | `--snapshot` | `POST /integrations/backup/snapshot` |
| 스케줄 설정 | `--config --daily <cron> --keep <n> [--reset]` | `POST /integrations/backup/configure` |
| 복원 | `--restore --recovery-point-arn <arn>` (또는 인터랙티브) | `POST /integrations/backup/restore` |
| 복원본 attach | `--attach --efs <id> --pvcs <..> --stss <..>` | `POST /integrations/backup/attach` |
| 상태/체크포인트 조회 | — | `GET /integrations/backup/{status,checkpoints}` |
| 정리 | — | `DELETE /integrations/backup/cleanup` |

> 복원은 EFS를 새로 만들어 워크로드에 다시 붙이는 흐름이라, restore 후 `attach`로 PVC/StatefulSet에 연결해야 데이터가 반영된다(인터랙티브 모드가 이 attach 여부를 물음).

### 7.6 실패 복구 / 부분 상태 정리 (AWS)
배포·삭제가 중간에 깨졌을 때:
- **네임스페이스 삭제 hang** — `tryToDeleteK8sNamespace`(`k8s.go`)가 self-heal: 1차 delete 실패 시 stuck 리소스(바운드 PV를 참조하는 PVC 등)와 네임스페이스 자체의 finalizer를 `kubectl patch … {"metadata":{"finalizers":null}}`로 강제 제거. 즉 destroy가 finalizer로 멈춰도 자동 복구를 시도함.
- **Terraform 부분 state** — 재배포 시 `clearTerraformState`가 기존 state를 정리(deploy_chain.go). "Backend configuration changed"류 실패는 `.terraform/terraform.tfstate`에서 backend 정보를 복원하는 수정이 반영됨 → `[[stage-b-backend-config-changed]]`, `[[terraform-destroy-secretsmanager-backend]]`.
- **고아 리소스** — self-heal로도 안 지워지는 EFS/ELB/보안그룹은 AWS 콘솔에서 수동 확인 권장(비용 발생 방지). destroy 로그는 `logs/destroy_<stack>_<network>_<ts>.log`.

---

## 8. 트러블슈팅 (wiki 링크 매핑)

| 증상 | wiki 페이지 |
|---|---|
| 포트 충돌(8545 등) | `[[port-conflicts]]` |
| L1 컨트랙트 배포 실패(가스) | `[[l1-gas-limits]]` |
| 동시 배포 → 순차 강제 | `[[sequential-l2-deploy]]`, `[[concurrent-deployment-guard]]` |
| Deploy 버튼 409(local stack 잔존) | `[[preset-deploy-409]]` |
| DRB 로컬 경로/템플릿 버그 | `[[drb-local-compose-path-template-bugs]]` |
| Blockscout TON 가격 오류 | `[[blockscout-wrong-coin-price]]` |
| AWS destroy namespace timeout | `[[destroy-namespace-timeout]]` |
| Bridge 체인 전환 불가 | `[[bridge-l2-chain-switch-error]]` |
| AWS 배포 후 Quick Links 고착 | `[[quick-links-provisioning-after-deploy]]` |
| Fault-proof: DelayedWETH/DGF/ASR 배포 실패 | `[[delayed-weth-proxy-empty]]`, `[[asr-dgf-proxy-address-bug]]`, `[[l2-output-oracle-uninitialized]]` |
| Terraform "Backend configuration changed" | `[[stage-b-backend-config-changed]]` |
| `terraform destroy` secretsmanager backend 오류 | `[[terraform-destroy-secretsmanager-backend]]` |
| AWS 배포 로그 미표시 | `[[aws-deploy-logs-not-visible]]` |

---

## 부록

### A. 계정별 최소 잔액 (Sepolia ETH)
Admin 0.5+ · Batcher 0.3+ · Proposer 0.3+

### B. 포트 / 컨테이너 레퍼런스
L2 노드: op-geth 8545/8546/8551, op-node 9545/7300, op-batcher 8548, op-proposer 8560
DRB regular(AWS): 9601/9602/9603
로컬 서비스: Bridge 3001, Explorer 4001, Grafana 3002, Uptime 3003

### C. wiki 크로스링크
`[[l2-deployment]]` `[[l2-deploy-local]]` `[[ec2-deploy]]` `[[presets]]` `[[integration-install]]` `[[cross-trade]]` `[[drb-project]]` `[[keystore]]` `[[deposit-tx]]`

---

## ⚠️ 확인 필요 목록 (본문 집필 시 검증)

1. **위저드 엔드포인트 분기 (minor)** — Local `/preset-deploy` vs AWS `/stacks/thanos` 분기 및 Full payload 필드 차이. 배포 절차 정확도에는 영향 적음(위저드가 추상화).

> ✅ **해결됨(2026-07-09, 코드 확인)**
> - **AWS DRB 온체인 활성화**: `drb-node/nodes/regular/handler.go` — regular 노드가 부팅 시 `deposit`→`activate` 자가 활성화. → 5.3
> - **버전 고정**: 배포가 전 레포 **main 최신 커밋** 기준. default tip 검증 유효. **본 가이드는 2026-07-09 main HEAD 스냅샷** — 이후 main 변경 시 재검증.
> - **AA Paymaster**: `aa_setup.go`/`constants/aa.go` — predeploy는 전 preset genesis 포함, `setupAAPaymaster`는 `FeeToken != TON`일 때만 실행(depositTo→updatePrice→addToken, aa-operator 가격 업데이트). Full 기본(TON)은 predeploy만. → 5.4
> - **모듈 설치 표면**: `installPresetModules`(deploy_chain.go:2548) — uptimeService/monitoring/blockExplorer/DRB/aaPaymaster는 Local·AWS 자동, **CrossTrade만 AWS 수동**(`K8s==nil` 가드). backend 라우트가 trh-sdk install 함수를 래핑. → 5장 intro
> - **AWS CrossTrade 파라미터**: trh-backend `dtos/cross_trade.go` — `mode/projectID/l1ChainConfig/l2ChainConfig[]` 스키마 확정. → 5.1
>
> ✅ **보충 완료(2026-07-09, 코드 확인)** — 운영/엣지 영역
> - **Mainnet 주의**(§1.4): `deploy_contracts.go`+`constants` — Local은 Testnet 고정, Mainnet은 AWS 전용. 이미지 태그는 `docker_images.go`에 핀.
> - **Fault-proof 분기**(§4.C): `deploy_contracts.go` — on 시 ASR 패치+cannon prestate+challenger 필수.
> - **aa-operator lifecycle**(§5.4): `cmd/aa-operator`+`aa_operator.go` — backend goroutine 또는 compose 서비스, non-TON 전용.
> - **Update/upgrade**(§7.4): `update_network.go`(체인 L1 교체+helm upgrade) vs `upgrade.go`(SDK 바이너리).
> - **Backup/Restore**(§7.5): `backup_manager.go`+backend backup 라우트 — EFS/AWS Backup.
> - **실패 복구**(§7.6): `k8s.go` self-heal(finalizer 강제 제거)+`clearTerraformState`.
