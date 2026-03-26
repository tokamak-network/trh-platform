---
phase: 01-foundation-preset-logic
verified: 2026-03-26T13:50:00Z
status: passed
score: 15/15 must-haves verified
re_verification: false
gaps: []
human_verification: []
---

# Phase 01: Foundation & Preset Logic Verification Report

**Phase Goal:** 테스트 인프라가 구축되고, 4개 Preset의 config/funding 핵심 로직이 unit test로 검증된 상태
**Verified:** 2026-03-26T13:50:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | `npm test` 실행 시 Vitest가 tests/ 디렉토리의 unit test를 발견하고 실행할 수 있다 | VERIFIED | `vitest.config.mts` line 10에 `tests/**/*.test.{ts,tsx}` include 패턴 추가됨. `npm test` 실행 시 6개 test file 모두 발견 및 149개 테스트 통과 확인 |
| 2   | 4개 Preset(General, DeFi, Gaming, Full)에 대해 BatchFreq, OutputFreq, Backup, Predeploys, Module, FeeToken이 기대값과 일치하는 테스트가 통과한다 | VERIFIED | `tests/unit/preset-config.test.ts` (37 tests) + `tests/unit/preset-matrix.test.ts` (48 tests) 모두 통과. PSET-01~07 전 coverage |
| 3   | BIP44 seed phrase에서 계정 주소가 올바르게 파생되는 테스트가 통과한다 | VERIFIED | `tests/unit/funding-flow.test.ts` FUND-01 — 5개 role(admin/proposer/batcher/challenger/sequencer) 모두 검증, 5개 고유 주소 + 결정론적 파생 확인 |
| 4   | Testnet 0.5 ETH / Mainnet 2 ETH 잔액 기준과 미달 시 차단 로직 테스트가 통과한다 | VERIFIED | FUND-02/03/04 — 17개 테스트 통과. boundary 케이스(exactly at threshold), mixed scenario, all-fail 포함 |
| 5   | 4 Preset x 2 인프라(Local/AWS) 파라메트릭 cross-regression matrix가 모두 통과한다 | VERIFIED | `preset-matrix.test.ts` — `describe.each` x `it.each` 조합으로 4x2x6 = 48 test case 모두 통과 |

**Score:** 5/5 truths verified

---

### Required Artifacts (from PLAN must_haves)

#### Plan 01-01 Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `vitest.config.mts` | tests/ include path added | VERIFIED | line 10: `'tests/**/*.test.{ts,tsx}'` 포함, 기존 `src/**/*.test.{ts,tsx}` 패턴 유지 |
| `tests/fixtures/presets.json` | Golden JSON fixture for 4 presets | VERIFIED | 4.2K, `general`/`defi`/`gaming`/`full` 키 존재, Go source 기반 정확한 값 |
| `tests/schemas/preset.schema.ts` | Zod schema for PresetDefinition | VERIFIED | `PresetDefinitionSchema`, `PresetsFixtureSchema`, `PresetDefinition` 타입 export |
| `tests/schemas/funding.schema.ts` | Zod schema for funding thresholds | VERIFIED | `FundingThresholdsSchema`, `NetworkTypeSchema` export |
| `tests/helpers/load-fixtures.ts` | Fixture loading utility | VERIFIED | `loadPresets()` export, `PresetsFixtureSchema.parse()` 호출로 런타임 검증 |
| `tests/helpers/funding.ts` | Funding validation pure functions | VERIFIED | `validateFunding`, `getMinBalance`, `DEFAULT_THRESHOLDS` export |

#### Plan 01-02 Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `tests/unit/preset-config.test.ts` | PSET-01~06 unit tests, min 100 lines | VERIFIED | 217 lines, `// @vitest-environment node` 헤더, PSET-01~06 describe 블록 존재 |
| `tests/unit/preset-matrix.test.ts` | PSET-07 parametric cross-regression, min 40 lines | VERIFIED | 55 lines, `describe.each(PRESET_IDS)` + `it.each(INFRA_PROVIDERS)`, 48 tests |

#### Plan 01-03 Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `tests/unit/funding-flow.test.ts` | FUND-01~04 unit tests, min 80 lines | VERIFIED | 191 lines, `// @vitest-environment node` 헤더, FUND-01~04 describe 블록 존재 |

---

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `tests/helpers/load-fixtures.ts` | `tests/fixtures/presets.json` | `fs.readFileSync + PresetsFixtureSchema.parse` | WIRED | line 8-9: `readFileSync(join(FIXTURES_DIR, 'presets.json'))` + `PresetsFixtureSchema.parse(raw)` |
| `tests/helpers/load-fixtures.ts` | `tests/schemas/preset.schema.ts` | `import PresetsFixtureSchema` | WIRED | line 3: `import { PresetsFixtureSchema, type PresetsFixture } from '../schemas/preset.schema'` |
| `tests/unit/preset-config.test.ts` | `tests/helpers/load-fixtures.ts` | `import loadPresets` | WIRED | line 3: `import { loadPresets } from '../helpers/load-fixtures'` |
| `tests/unit/preset-config.test.ts` | `tests/schemas/preset.schema.ts` | `import PresetDefinitionSchema` | WIRED | line 4: `import { PresetDefinitionSchema } from '../schemas/preset.schema'` |
| `tests/unit/funding-flow.test.ts` | `tests/helpers/funding.ts` | `import validateFunding, getMinBalance` | WIRED | line 4: `import { validateFunding, getMinBalance, DEFAULT_THRESHOLDS } from '../helpers/funding'` |
| `tests/unit/funding-flow.test.ts` | `ethers` | `HDNodeWallet.fromPhrase` | WIRED | line 3: `import { HDNodeWallet } from 'ethers'`, line 24: `HDNodeWallet.fromPhrase(mnemonic, ...)` |

---

### Data-Flow Trace (Level 4)

테스트 파일들은 동적 데이터를 렌더링하는 UI 컴포넌트가 아니라 fixture 데이터를 검증하는 단위 테스트이므로, 전통적인 Level 4 data-flow trace는 해당하지 않음.

대신 데이터 흐름 검증:

| Source | Consumer | Flow | Status |
| ------ | -------- | ---- | ------ |
| `presets.json` | `loadPresets()` via `PresetsFixtureSchema.parse()` | JSON 파일 읽기 → Zod parse → 타입 안전 객체 반환 | FLOWING |
| `tests/helpers/funding.ts` `DEFAULT_THRESHOLDS` | `getMinBalance()`, `validateFunding()` | 상수 → 순수 함수 → 테스트 결과 검증 | FLOWING |
| `ethers.HDNodeWallet` | `deriveAddress()` in funding-flow.test.ts | 실제 BIP44 파생 → 주소 검증 | FLOWING — 외부 라이브러리 사용, mock 아님 |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| `npm test` 실행 시 tests/ 파일 발견 | `npm test` | 6 test files, 149 passed | PASS |
| preset-config 37 tests 통과 | `vitest run tests/unit/preset-config.test.ts` | 37 passed | PASS |
| preset-matrix 48 tests 통과 | `vitest run tests/unit/preset-matrix.test.ts` | 48 passed | PASS |
| funding-flow 17 tests 통과 | `vitest run tests/unit/funding-flow.test.ts` | 17 passed | PASS |
| zod 설치 확인 | `package.json` devDependencies | `"zod": "^4.3.6"` 확인 | PASS |
| 기존 src/ 테스트 영향 없음 | `npm test` | 기존 47 src 테스트 + 102 신규 tests 모두 통과 | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| INFR-01 | 01-01 | Docker daemon, 네트워크, AWS 자격증명 불필요 | SATISFIED | 모든 테스트가 fs/ethers/zod만 사용. Docker, network, AWS 의존성 없음. `// @vitest-environment node` 사용 |
| INFR-02 | 01-01 | Vitest + Playwright 테스트 환경 구성 및 CI 실행 가능 | SATISFIED | Vitest 구성 완료. `npm test` 정상 실행. Playwright는 Phase 4 범위 |
| INFR-03 | 01-01 | Preset fixture 데이터를 JSON으로 중앙 관리 | SATISFIED | `tests/fixtures/presets.json` 단일 파일로 모든 preset 테스트가 공유 |
| INFR-04 | 01-01 | Zod 기반 API contract 스키마 정의 | SATISFIED | `preset.schema.ts`, `funding.schema.ts` — Zod 스키마로 런타임 validation |
| PSET-01 | 01-02 | 4개 Preset의 BatchFreq, OutputFreq, ChallengePeriod unit test | SATISFIED | `preset-config.test.ts` PSET-01 describe: general(1800/1800/12), defi(900/900/12), gaming(300/600/12), full(600/600/12) 정확히 검증 |
| PSET-02 | 01-02 | Preset별 Backup 활성화 여부 검증 | SATISFIED | `preset-config.test.ts` PSET-02: general=false, defi/gaming/full=true |
| PSET-03 | 01-02 | 인프라별(Local Docker, AWS EC2) config 분기 검증 | SATISFIED | estimatedTime에 'local'/'aws' 키 존재 및 registerCandidate 분기 검증 (full만 true) |
| PSET-04 | 01-02 | Genesis Predeploys 목록 정확성 검증 | SATISFIED | 13개 OP standard, defi 18개, gaming 17개, full 22개 count + 각 contract 이름 존재 검증 |
| PSET-05 | 01-02 | 모듈 활성화 매트릭스 검증 | SATISFIED | 5개 모듈 boolean 값 preset별 정확한 매트릭스 검증 |
| PSET-06 | 01-02 | Fee Token 가용성 검증 | SATISFIED (NOTE) | 모든 preset이 ["TON","ETH","USDT","USDC"]로 검증됨. PLAN에서 명시적으로 Go source를 source of truth로 결정 (REQUIREMENTS.md의 "General: TON/ETH only" 설명은 Go source와 불일치하므로 Go source 우선) |
| PSET-07 | 01-02 | 4x2 파라메트릭 cross-preset regression matrix | SATISFIED | `preset-matrix.test.ts`: 4 presets x 2 infra x 6 checks = 48 tests 통과 |
| FUND-01 | 01-03 | BIP44 키 파생 검증 | SATISFIED (NOTE) | 5개 role(admin/proposer/batcher/challenger/sequencer) 검증. REQUIREMENTS.md는 "4개 주소"로 기술하나 keystore.ts의 실제 ROLE_INDICES는 5개를 정의함. 구현이 더 완전함 |
| FUND-02 | 01-03 | Testnet 최소 잔액 기준(0.5 ETH) 검증 | SATISFIED | `getMinBalance('testnet')` = 500000000000000000n 검증 |
| FUND-03 | 01-03 | Mainnet 최소 잔액 기준(2 ETH) 검증 | SATISFIED | `getMinBalance('mainnet')` = 2000000000000000000n 검증 |
| FUND-04 | 01-03 | 잔액 미달 시 배포 차단 로직 검증 | SATISFIED | all-pass, one-fail, all-fail, mixed, exact boundary, below-boundary 6개 시나리오 검증 |

**NOTE on PSET-06:** REQUIREMENTS.md 텍스트(`General: TON/ETH only, 나머지: +USDT/USDC`)와 Go source 실제값(모두 TON/ETH/USDT/USDC)이 다름. PLAN은 이 불일치를 명시적으로 인지하고 Go source를 우선으로 선택함. REQUIREMENTS.md 텍스트 업데이트가 권장되나 테스트 로직 자체는 올바름.

**NOTE on FUND-01:** REQUIREMENTS.md와 ROADMAP.md가 "4개 주소(admin/sequencer/batcher/proposer)"라고 기술하지만 keystore.ts는 challenger를 포함한 5개 role을 정의함. 구현이 REQUIREMENTS.md보다 정확하며 더 안전함.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (없음) | - | - | - | - |

모든 파일에서 TODO, FIXME, placeholder, 빈 구현, console.log only 패턴 없음.

---

### Human Verification Required

없음. 모든 검증이 자동화된 테스트 실행으로 확인 가능하며, 149개 테스트가 실제로 통과함.

---

### Gaps Summary

갭 없음. 15개 요구사항(INFR-01~04, PSET-01~07, FUND-01~04) 모두 구현 및 테스트로 검증됨.

두 가지 문서 불일치가 존재하나 구현 코드 자체는 올바름:
1. **PSET-06**: REQUIREMENTS.md 텍스트가 Go source와 불일치함 — 테스트는 올바른 Go source 값을 검증
2. **FUND-01**: REQUIREMENTS.md/ROADMAP.md가 "4개 주소"라고 기술하나 구현은 5개 role을 검증 — 더 완전한 구현

이 불일치들은 REQUIREMENTS.md 문서 업데이트 대상이지 테스트 코드 수정 대상이 아님.

---

### Commit Verification

| Commit | Purpose | Verified |
| ------ | ------- | -------- |
| `7b843ca` | chore(01-01): install zod, extend vitest config | VERIFIED |
| `3c80431` | feat(01-01): golden JSON fixture, Zod schemas, helpers | VERIFIED |
| `ae81fbd` | test(01-02): preset config tests PSET-01~06 | VERIFIED |
| `b47dd72` | test(01-02): parametric matrix PSET-07 | VERIFIED |
| `e62cd62` | test(01-03): funding flow tests FUND-01~04 | VERIFIED |

---

_Verified: 2026-03-26T13:50:00Z_
_Verifier: Claude (gsd-verifier)_
