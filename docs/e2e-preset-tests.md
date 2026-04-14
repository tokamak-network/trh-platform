# E2E Preset 검증 테스트 실행 가이드

`docs/preset-comparison.md`에 정의된 Preset 계약이 실제 배포에서 지켜지는지 검증하는 E2E 테스트 스펙 모음과 실행 절차를 설명한다.

---

## 1. 스펙 목록

| 스펙 | 파일 | 모드 | 목적 |
|------|------|------|------|
| **A** | `tests/e2e/matrix/preset-predeploys.live.spec.ts` | Live | Genesis Predeploy bytecode 전수 검증 |
| **B** | `tests/e2e/matrix/preset-chain-params.live.spec.ts` | Live | Chain 파라미터 기본값 검증 |
| **C** | `tests/e2e/preset-overridable-fields.spec.ts` | MSW Browser | Wizard overridableFields 계약 검증 |
| **D** | `tests/e2e/electron-general.live.spec.ts` | Electron | General+TON 배포 → 모듈/paymaster 확인 |
| **E** | `tests/e2e/electron-defi.live.spec.ts` | Electron | DeFi+ETH 배포 → CrossTrade/AA 확인 |
| **F** | `tests/e2e/electron-gaming.live.spec.ts` | Electron | Gaming+ETH 배포 → DRB/AA 확인 |
| **G** | `tests/e2e/electron-full.live.spec.ts` | Electron | Full+USDC 배포 → 전체 모듈/predeploy 확인 |

헬퍼: `tests/e2e/helpers/presets.ts` — 주소 상수 + `getPresetData()` + `assertIntegrationModules()` + `assertOpStandardBytecode()` (A·C·D·E·F·G 공통 사용)

### 테스트 ID 목록

| ID | 스펙 | 설명 |
|----|------|------|
| PP-01 | A | OP Standard 11종 bytecode 존재 (all presets) |
| PP-02 | A | DeFi 추가 5종 bytecode — 주소 확정 후 활성화 |
| PP-03 | A | DRB 3종 (gaming/full) |
| PP-04 | A | AA 4종 (gaming/full) |
| PP-05 | A | genesisPredeploys 총 수 13/18/20/25 일치 |
| CP-01 | B | l2BlockTime ≈ 2s (인접 블록 timestamp 차이) |
| CP-02 | B | batchSubmissionFrequency = 1800/900/300/600 |
| CP-03 | B | outputRootFrequency = 1800/900/600/600 |
| CP-04 | B | backupEnabled = false/true/true/true |
| OV-01 | C | General: 5개 필드 모두 editable |
| OV-02 | C | DeFi: l2BlockTime·backupEnabled locked |
| OV-03 | C | Gaming: challengePeriod·backupEnabled locked |
| OV-04 | C | Full: backupEnabled locked |
| EGN-01 | D | General+TON Electron 앱 시작 + deploy API 호출 |
| EGN-02 | D | 배포 완료 + bridge/blockExplorer만 존재 확인 |
| EGN-03 | D | OP Standard 11종 bytecode + MultiTokenPaymaster 미배포 |
| EGN-04 | D | Chain params + overridableFields + genesisPredeploys 수 계약 검증 |
| EDF-01 | E | DeFi+ETH Electron 앱 시작 + deploy API 호출 |
| EDF-02 | E | 배포 완료 + bridge/explorer/monitoring/uptime/crossTrade 존재, drb 부재 |
| EDF-03 | E | OP Standard 11종 + AA 4종 bytecode 검증 (DeFi predeploy는 주소 확정 후 활성화) |
| EDF-04 | E | CrossTrade dApp probe + L2 CrossTrade 4개 컨트랙트 + AA bundler |
| EDF-05 | E | Chain params + overridableFields + genesisPredeploys 수 계약 검증 |
| EGM-01 | F | Gaming+ETH Electron 앱 시작 + deploy API 호출 |
| EGM-02 | F | 배포 완료 + monitoring/uptime/drb 존재, crossTrade 부재 |
| EGM-03 | F | OP Standard 11종 + DRB 3 + AA 4 predeploy bytecode 검증 |
| EGM-04 | F | AA bundler eth_supportedEntryPoints |
| EGM-05 | F | Chain params + overridableFields + genesisPredeploys 수 계약 검증 |
| EFL-01 | G | Full+USDC Electron 앱 시작 + deploy API 호출 |
| EFL-02 | G | 배포 완료 + 6개 모듈 전체 확인 |
| EFL-03 | G | OP Standard + DRB + AA predeploy bytecode 검증 |
| EFL-04 | G | CrossTrade dApp + L2 CrossTrade 4개 컨트랙트 + AA bundler |
| EFL-05 | G | Chain params + overridableFields + genesisPredeploys 수 계약 검증 |

---

## 2. 모드별 사전 준비

### 2-1. MSW Browser 모드 (스펙 C)

```
전제조건: 없음 (MSW가 API를 mock)
```

- [ ] Node.js 설치 확인
- [ ] `npm install` 완료

### 2-2. Live 통합 모드 (스펙 A, B)

- [ ] Docker 서비스 실행: `make up && make status`
- [ ] 배포된 4개 P0 조합 stack이 존재하거나, `run-matrix.sh`로 새로 배포
  - `general:TON`, `defi:USDT`, `gaming:ETH`, `full:USDC`
- [ ] `LIVE_PRESET`, `LIVE_FEE_TOKEN`, `LIVE_CHAIN_NAME` 설정
- [ ] Backend API `http://localhost:8000` 접근 가능

### 2-3. Electron 모드 (스펙 D, E, F, G)

- [ ] Docker 서비스 실행: `make up && make status`
- [ ] Electron 빌드: `npm run build` → `dist/main/index.js` 존재 확인
- [ ] Sepolia L1 RPC URL (→ `LIVE_L1_RPC_URL` 환경변수)
- [ ] BIP-39 Seed Phrase (→ `LIVE_SEED_PHRASE` 환경변수) **[결정 필요 — §3 참조]**
- [ ] 각 fee token 잔액 확인 **[결정 필요 — §3 참조]**

---

## 3. 의사결정 체크포인트

실행 전 반드시 아래 항목을 결정해야 한다. **각 항목을 검토하고 값을 준비한 후 실행으로 진행한다.**

### CP-A. Seed Phrase 재사용 vs. 신규 생성

**질문**: 기존 테스트용 seed phrase가 있는가?

| 상황 | 권장 |
|------|------|
| 기존 test-wallet seed phrase가 있고 잔액이 충분 | 재사용 (`LIVE_SEED_PHRASE` 환경변수에 설정) |
| 없거나 잔액 부족 | `ethers.Wallet.createRandom().mnemonic.phrase`로 생성 후 HD[0] 주소에 Sepolia ETH 펀딩 |

> HD[0..4] 주소 확인: `npx ts-node -e "const {ethers}=require('ethers'); const w=ethers.HDNodeWallet.fromPhrase('YOUR_MNEMONIC'); for(let i=0;i<5;i++){console.log(i,w.derivePath(\`m/44'/60'/0'/0/\${i}\`).address)}"`

**필요한 역할별 HD 인덱스:**

| 인덱스 | 역할 |
|--------|------|
| HD[0] | Admin (배포 트리거, 가스비) |
| HD[1] | Sequencer |
| HD[2] | Batcher |
| HD[3] | Proposer |
| HD[4] | Challenger |

---

### CP-B. Sepolia L1 RPC 제공 방법

**질문**: 공용 Alchemy RPC를 쓸 것인가, 자체 키를 쓸 것인가?

> **경고**: 공용 RPC(Alchemy free tier)는 rate limit이 발생할 수 있다. Electron 배포 테스트는 여러 L1 트랜잭션을 단기간에 발생시키므로 `429 Too Many Requests`로 실패할 수 있다. **자체 Alchemy/Infura/QuickNode API Key를 강력히 권장한다.**

```bash
export LIVE_L1_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
```

---

### CP-C. Stack 재사용 vs. 새로 배포

**질문**: 이미 배포된 stack이 있는가?

| 상황 | 권장 |
|------|------|
| 같은 chainName의 stack이 배포됨 + Deployed 상태 | `LIVE_STACK_ID=<stackId>`로 재사용 (시간 절약) |
| 없거나 상태 이상 | 새로 배포 (LIVE_STACK_ID 미설정) |

Stack ID 확인 방법:
```bash
# 백엔드 API로 스택 목록 조회
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gmail.com","password":"admin"}' | jq -r '.data.accessToken' > /tmp/tok.txt

curl -s http://localhost:8000/api/v1/stacks/thanos \
  -H "Authorization: Bearer $(cat /tmp/tok.txt)" | jq '.data[] | {id:.id, name:.chainName, status:.status}'
```

---

### CP-D. Fee Token별 잔액 요구사항

각 Electron 테스트는 해당 fee token을 사용해 L2에서 가스를 지불한다.

| 테스트 | Fee Token | HD[0] 주소 | 필요 잔액 |
|--------|-----------|------------|-----------|
| EGN (General) | TON | HD[0] | 최소 0.5 Sepolia ETH (L1 컨트랙트 배포 가스) |
| EDF (DeFi) | ETH | HD[0] | 최소 0.5 Sepolia ETH + paymaster 초기 자금 |
| EGM (Gaming) | ETH | HD[0] | 최소 0.5 Sepolia ETH + paymaster 초기 자금 |
| EFL (Full) | USDC | HD[0] | 최소 0.5 Sepolia ETH + USDC Bridge 유동성 |

> **주의**: TON fee token인 General preset도 L1 컨트랙트 배포와 Bridge 펀딩에 Sepolia ETH가 필요하다. TON은 L2 네이티브 가스 토큰이지 L1 가스가 아니다.

잔액 확인 (Sepolia Etherscan 또는 RPC):
```bash
# HD[0] Sepolia ETH 잔액 확인
cast balance HD0_ADDRESS --rpc-url $LIVE_L1_RPC_URL
```

---

## 4. 실행 명령

### MSW Browser (스펙 C)

```bash
# OV-01 ~ OV-04 전체 실행
npx playwright test tests/e2e/preset-overridable-fields.spec.ts

# 특정 테스트만
npx playwright test tests/e2e/preset-overridable-fields.spec.ts -g "OV-02"
```

### Live 통합 (스펙 A, B)

```bash
# PP-01~05: general preset
LIVE_PRESET=general LIVE_FEE_TOKEN=TON LIVE_CHAIN_NAME=ton-general \
  npx playwright test --config playwright.live.config.ts \
  tests/e2e/matrix/preset-predeploys.live.spec.ts

# CP-01~04: general preset
LIVE_PRESET=general LIVE_FEE_TOKEN=TON LIVE_CHAIN_NAME=ton-general \
  npx playwright test --config playwright.live.config.ts \
  tests/e2e/matrix/preset-chain-params.live.spec.ts

# 4개 P0 조합 전체 (run-matrix.sh 사용 시)
# matrix 실행 스크립트가 tests/e2e/matrix/ 디렉터리 전체를 실행하므로
# preset-predeploys / preset-chain-params 스펙도 자동 포함된다.
bash tests/e2e/matrix/run-matrix.sh
```

### Electron (스펙 D, E, F, G)

```bash
# 공통 환경변수
export LIVE_L1_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
export LIVE_SEED_PHRASE="word1 word2 ... word12"
export LIVE_BACKEND_URL="http://localhost:8000"

# 빌드 (처음 한 번만)
npm run build

# EGN: General+TON (가장 가벼움 — 처음 검증 시 권장)
npx playwright test --config playwright.electron.config.ts \
  tests/e2e/electron-general.live.spec.ts

# EDF: DeFi+ETH (CrossTrade + AA bundler 포함)
npx playwright test --config playwright.electron.config.ts \
  tests/e2e/electron-defi.live.spec.ts

# EGM: Gaming+ETH (DRB + AA bundler 포함)
npx playwright test --config playwright.electron.config.ts \
  tests/e2e/electron-gaming.live.spec.ts

# EFL: Full+USDC (가장 무거움 — 마지막에 실행)
npx playwright test --config playwright.electron.config.ts \
  tests/e2e/electron-full.live.spec.ts

# 기존 stack 재사용 시 (배포 시간 단축)
LIVE_STACK_ID=<stackId> npx playwright test --config playwright.electron.config.ts \
  tests/e2e/electron-general.live.spec.ts
```

---

## 5. 실패 시 트러블슈팅

### PP-05 실패: genesisPredeploys 수 불일치

`preset-predeploys.live.spec.ts > PP-05`에서 실제 count ≠ expected count가 나오면:

1. `tests/fixtures/presets.json`의 `genesisPredeploys` 배열을 확인한다.
2. `docs/preset-comparison.md`의 표와 배열 내용이 일치하는지 비교한다.
3. 백엔드 genesis 설정 (`tokamak-thanos` 저장소)과 `presets.json`이 일치하는지 확인한다.

우선 순서: **실제 배포 확인 → presets.json 수정 → preset-comparison.md 수정**

---

### PP-01~04 실패: bytecode = '0x'

특정 주소에 bytecode가 없는 경우:

1. L2 RPC URL이 올바른지 확인 (`LIVE_CHAIN_NAME` → `resolveStackUrls` 경로 확인)
2. `provider.getBlockNumber()` 호출이 정상 응답하는지 확인 (체인이 살아있는지)
3. 해당 preset의 genesis 파일에 해당 컨트랙트가 포함됐는지 Thanos 저장소에서 확인

---

### CP-02~04 실패: API 응답 필드 이름 불일치

Backend API가 snake_case(`batch_submission_frequency`)를 반환하고 preset-chain-params 스펙이 camelCase를 기대하는 경우:

스펙은 이미 양쪽을 모두 시도한다 (`data.batchSubmissionFrequency ?? data.batch_submission_frequency`). 만약 둘 다 `undefined`이면 API 응답을 `console.log`로 출력해 실제 필드명을 확인한다.

---

### OV 실패: 필드가 렌더링되지 않음

`assertFieldEditability`는 렌더링되지 않은 필드를 "locked"으로 간주한다. 단, `overridableFields`에 있는 필드가 렌더링되지 않으면 경고 메시지가 출력된다. 이 경우:

1. 실제 wizard UI에서 해당 필드가 존재하는지 수동 확인
2. 필드의 `data-testid` 또는 `id` 속성을 확인하고 `getFieldLocator` 함수의 selector를 업데이트

---

### EGN/EDF/EGM/EFL 실패: LIVE_SEED_PHRASE 관련 오류

`deployPreset()` 내부에서 `LIVE_SEED_PHRASE`를 읽어 backend에 전달한다. 오류 메시지에 "seed" 또는 "mnemonic"이 포함된 경우:

1. `echo $LIVE_SEED_PHRASE`로 환경변수가 설정됐는지 확인
2. 12단어가 공백으로 구분됐는지, BIP-39 유효 단어인지 확인
3. HD[0] 주소에 Sepolia ETH 잔액이 충분한지 확인

---

### Bundler 실패: EDF-04 / EGM-04 / EFL-04

Bundler (alto)는 bridge 펀딩 + AA setup 완료 후 시작한다. deploy 직후 30-120초가 소요될 수 있다. 스펙은 이미 polling으로 대기하지만 timeout (3분)이 부족하면:

1. `BUNDLER_POLL_TIMEOUT_MS` 상수 값을 늘린다 (예: 5분)
2. `make logs | grep bundler` 또는 `make logs | grep alto`로 bundler 컨테이너 로그 확인

---

## 6. DeFi Predeploy 주소 확인 절차 (PP-02 / EFL-03 활성화)

현재 `tests/e2e/helpers/presets.ts`의 `DEFI_ADDRESSES`가 비어있어 PP-02와 EFL-03의 DeFi 부분이 건너뛴다. 주소를 채우는 방법:

1. Thanos genesis config에서 UniswapV3Factory, SwapRouter, NonfungiblePositionManager, USDCBridge, WETH9 주소를 조회한다.
2. `tests/e2e/helpers/presets.ts`의 `DEFI_ADDRESSES` 객체에 추가한다:
   ```typescript
   export const DEFI_ADDRESSES: Record<string, string> = {
     UniswapV3Factory:                    '0x...',
     UniswapV3SwapRouter:                 '0x...',
     UniswapV3NonfungiblePositionManager: '0x...',
     USDCBridge:                          '0x...',
     WrappedETH:                          '0x4200000000000000000000000000000000000006',
   };
   ```
3. `PP-05`의 genesisPredeploys 수 (18, 25)가 fixture와 일치하는지 재확인한다.
4. `docs/preset-comparison.md` § "DeFi 추가" 표에 주소 컬럼을 추가한다.
