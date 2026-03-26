# Phase 1: Foundation & Preset Logic - Research

**Researched:** 2026-03-26
**Domain:** Vitest test infrastructure, Preset config validation, BIP44 key derivation, Zod schema validation
**Confidence:** HIGH

## Summary

Phase 1은 테스트 인프라 구축과 Preset config/funding 핵심 로직의 unit test 검증을 목표로 한다. Vitest는 이미 프로젝트에 설치(^4.1.0)되어 있으며 `src/**/*.test.{ts,tsx}` 패턴으로 동작 중이다. `tests/` 디렉토리를 include에 추가하고, Go 소스(trh-backend)에서 추출한 golden JSON fixture를 기반으로 4개 Preset의 파라미터 정합성을 검증하는 것이 핵심이다.

Go 소스 코드(trh-backend/pkg/services/thanos/presets/service.go)를 직접 읽어 4개 Preset의 정확한 파라미터를 확인했다. PROJECT.md의 비교표와 실제 Go 소스 사이에 **중요한 불일치**가 있다 (Fee Token, Monitoring 등). Golden JSON은 Go 소스의 `DefaultPresetDefinitions`를 JSON으로 직렬화하여 생성해야 한다.

**Primary recommendation:** Go 소스의 `DefaultPresetDefinitions`를 그대로 JSON으로 export하는 Go 테스트를 작성하고, 이 JSON을 `tests/fixtures/presets.json`에 배치하여 TypeScript 테스트의 단일 소스로 사용한다.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: `tests/` 디렉토리는 harness 전용으로 사용. 기존 `src/*.test.ts` 파일들(keystore.test.ts, aws-auth.test.ts 등)은 그대로 유지하고 건드리지 않는다.
- D-02: Vitest config에서 `tests/` 경로를 include에 추가하여 기존 테스트와 함께 실행 가능하게 한다.
- D-03: Preset config 기대값은 Go 코드(trh-sdk)에서 golden JSON으로 추출하여 사용한다.
- D-04: Go 측 golden JSON 생성 스크립트/테스트를 trh-sdk에 추가해야 한다.
- D-05: 단일 `presets.json` 파일에 4개 Preset 전체 데이터를 관리한다.

### Claude's Discretion
- tests/ 내부 하위 디렉토리 구조 (unit/, integration/ 등 분리 여부)
- Zod 스키마 파일 위치 및 네이밍 컨벤션
- BIP44 키 파생 테스트의 테스트 벡터 선정

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFR-01 | 테스트 실행에 Docker daemon, 실제 네트워크, AWS 자격증명이 불필요 | 모든 테스트는 vi.mock()으로 외부 의존성 차단. node environment 사용. |
| INFR-02 | Vitest + Playwright 기반 테스트 환경 구성 및 CI 실행 가능 | Vitest 4.1.0 이미 설치. vitest.config.mts에 `tests/` include 추가만 필요. Playwright는 Phase 4에서 사용. |
| INFR-03 | Preset fixture 데이터를 JSON으로 중앙 관리 | Go 소스에서 golden JSON 추출 -> `tests/fixtures/presets.json` 배치 |
| INFR-04 | Zod 기반 API contract 스키마 정의로 mock 정합성 보장 | zod ^3.24 설치 필요. Preset Definition 스키마를 Zod로 정의하여 fixture validation. |
| PSET-01 | 4개 Preset의 BatchFreq, OutputFreq, ChallengePeriod 검증 | Go 소스에서 정확한 값 확인 완료 (아래 Preset Truth Table 참조) |
| PSET-02 | Preset별 Backup 활성화 여부 검증 | General: false, DeFi/Gaming/Full: true (Go 소스 확인) |
| PSET-03 | 인프라별(Local Docker, AWS EC2) config 분기 검증 | preset_deploy.go에서 InfraProvider 기반 분기 확인. local일 때 AWS validation 스킵. |
| PSET-04 | Preset별 Genesis Predeploys 목록 검증 | Go 소스에서 opPredeploys/defiPredeploys/gamingPredeploys/fullPredeploys 전체 목록 확인 |
| PSET-05 | Preset별 모듈 활성화 매트릭스 검증 | Go 소스에서 Modules map 전체 확인 완료 |
| PSET-06 | Preset별 Fee Token 가용성 검증 | **주의:** Go 소스에서는 4개 Preset 모두 TON/ETH/USDT/USDC 지원. PROJECT.md 비교표와 불일치. |
| PSET-07 | 4 Preset x 2 인프라 파라메트릭 cross-regression | test.each()로 8개 조합 순회 |
| FUND-01 | BIP44 키 파생 검증 (admin/sequencer/batcher/proposer) | keystore.ts에서 BIP44 m/44'/60'/0'/0/{0-4} 경로 사용. ethers HDNodeWallet. |
| FUND-02 | Testnet 최소 잔액 기준 0.5 ETH 검증 | mock RPC로 balance 응답 제어 |
| FUND-03 | Mainnet 최소 잔액 기준 2 ETH 검증 | mock RPC로 balance 응답 제어 |
| FUND-04 | 잔액 미달 시 배포 차단 로직 검증 | 차단 로직은 아직 trh-platform에 구현되지 않았을 수 있음 -- 구현 확인 필요 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 응답은 한글, 코드 주석/변수명은 영어
- Conventional Commits 형식
- 커밋 전 lint와 type check 확인
- TypeScript strict mode 필수
- 2-space indentation, single quotes, semicolons
- 테스트 파일: 소스명.test.ts 패턴
- vi.mock('electron') 패턴 사용 (기존 패턴)
- vi.resetModules()로 테스트 간 모듈 상태 초기화

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^4.1.0 (installed) | Unit test runner | 이미 프로젝트에 설치. ESM 네이티브, vi.mock() 지원. |
| zod | ^3.24 (to install) | Schema validation | Preset fixture/API contract 검증. TS 타입 추론 자동. |
| ethers | ^6.13.4 (installed) | BIP44 key derivation | 이미 사용 중. HDNodeWallet.fromPhrase() |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| happy-dom | ^20.8.4 (installed) | DOM environment | 기존 renderer 테스트용. tests/ 의 node 테스트에서는 불필요. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| zod | ajv + JSON Schema | Ajv는 별도 스키마 파일 필요. Zod는 TS 타입과 통합. |
| golden JSON | 수동 fixture 작성 | 수동 작성은 Go 소스 변경 시 drift 발생. Golden JSON은 자동 동기화. |

**Installation:**
```bash
npm install -D zod
```

**Version verification:**
- vitest: ^4.1.0 installed (latest: 4.1.1) -- current
- zod: not installed (latest: 3.24.6) -- to install
- ethers: ^6.13.4 installed -- current

## Architecture Patterns

### Recommended Test Directory Structure
```
tests/
  fixtures/
    presets.json          # Golden JSON from Go source (4 presets x all fields)
  schemas/
    preset.schema.ts      # Zod schemas for Preset Definition
    funding.schema.ts     # Zod schemas for funding thresholds
  unit/
    preset-config.test.ts     # PSET-01~06: Preset parameter validation
    preset-matrix.test.ts     # PSET-07: 4x2 parametric cross-regression
    funding-flow.test.ts      # FUND-01~04: BIP44 + balance checks
  helpers/
    load-fixtures.ts      # Fixture loading utility
```

### Pattern 1: Golden JSON Fixture Loading
**What:** Go 소스에서 생성된 JSON을 읽어 테스트에서 사용
**When to use:** 모든 Preset 관련 테스트
**Example:**
```typescript
// tests/helpers/load-fixtures.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { PresetDefinitionSchema, type PresetDefinition } from '../schemas/preset.schema';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

export function loadPresets(): Record<string, PresetDefinition> {
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, 'presets.json'), 'utf-8'));
  // Validate fixture itself against Zod schema
  const result: Record<string, PresetDefinition> = {};
  for (const [id, data] of Object.entries(raw)) {
    result[id] = PresetDefinitionSchema.parse(data);
  }
  return result;
}
```

### Pattern 2: Parametric Preset Testing with test.each
**What:** 4 Preset x 2 Infrastructure 조합을 test.each로 순회
**When to use:** PSET-07 cross-regression matrix
**Example:**
```typescript
// tests/unit/preset-matrix.test.ts
const PRESETS = ['general', 'defi', 'gaming', 'full'] as const;
const INFRA_PROVIDERS = ['local', 'aws'] as const;

describe.each(PRESETS)('Preset: %s', (presetId) => {
  it.each(INFRA_PROVIDERS)('infra: %s - generates valid config', (infra) => {
    const preset = fixtures[presetId];
    // validate chain defaults, modules, predeploys for this combo
    expect(preset.chainDefaults.batchSubmissionFrequency).toBeGreaterThan(0);
    // infra-specific checks
    if (infra === 'aws') {
      // AWS-specific validation (e.g., security group ports)
    }
  });
});
```

### Pattern 3: Zod Schema Definition for Preset
**What:** TypeScript 타입과 런타임 검증을 동시에 제공하는 Zod 스키마
**When to use:** fixture loading, API contract validation
**Example:**
```typescript
// tests/schemas/preset.schema.ts
import { z } from 'zod';

export const PresetDefinitionSchema = z.object({
  id: z.enum(['general', 'defi', 'gaming', 'full']),
  name: z.string().min(1),
  description: z.string().min(1),
  modules: z.record(z.string(), z.boolean()),
  genesisPredeploys: z.array(z.string()).min(1),
  estimatedTime: z.record(z.string(), z.string()),
  chainDefaults: z.object({
    l2BlockTime: z.number().int().positive(),
    batchSubmissionFrequency: z.number().int().positive(),
    outputRootFrequency: z.number().int().positive(),
    challengePeriod: z.number().int().positive(),
    registerCandidate: z.boolean(),
    backupEnabled: z.boolean(),
  }),
  helmValues: z.record(z.string(), z.any()),
  overridableFields: z.array(z.string()).min(1),
  availableFeeTokens: z.array(z.string()).min(1),
});

export type PresetDefinition = z.infer<typeof PresetDefinitionSchema>;
```

### Pattern 4: Node Environment for Main Process Tests
**What:** `// @vitest-environment node` 주석으로 테스트별 environment 제어
**When to use:** tests/ 디렉토리의 모든 테스트 (Electron main process 관련)
**Example:**
```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
```
기존 keystore.test.ts에서 이미 사용 중인 패턴이다.

### Anti-Patterns to Avoid
- **Mock 결과만 검증하기:** `expect(mock).toHaveBeenCalledWith(...)` 대신 실제 데이터 변환 결과를 검증해야 한다.
- **Fixture를 수동 작성하기:** Go 소스와 drift가 발생한다. 반드시 golden JSON에서 자동 생성.
- **happy-dom environment에서 node 테스트 실행:** tests/ 의 node 테스트는 `@vitest-environment node`를 명시해야 한다. 기본값이 happy-dom이므로.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Preset 파라미터 기대값 | 수동 작성한 상수 | Go에서 추출한 golden JSON | Go 소스 변경 시 자동 감지 |
| Fixture 타입 검증 | typeof 체크 | Zod schema.parse() | 런타임 검증 + 타입 추론 동시 |
| BIP44 주소 검증 | 정규식 매칭만 | ethers HDNodeWallet로 직접 파생 비교 | 정규식은 잘못된 주소도 통과시킴 |

**Key insight:** Golden JSON은 Go 소스의 `DefaultPresetDefinitions`를 직접 직렬화한 것이므로, TypeScript 테스트가 Go 소스의 실제 값과 자동으로 동기화된다.

## Preset Truth Table (Go 소스 기준)

**CRITICAL:** Go 소스 코드(`trh-backend/pkg/services/thanos/presets/service.go`)에서 직접 추출한 정확한 값이다. PROJECT.md의 비교표와 불일치하는 항목이 있다.

### Chain Defaults

| Preset | BatchFreq | OutputFreq | ChallengePeriod | L2BlockTime | RegisterCandidate | Backup |
|--------|-----------|------------|-----------------|-------------|-------------------|--------|
| general | 1800 | 1800 | 12 | 2 | false | false |
| defi | 900 | 900 | 12 | 2 | false | true |
| gaming | 300 | 600 | 12 | 2 | false | true |
| full | 600 | 600 | 12 | 2 | true | true |

### Modules

| Module | general | defi | gaming | full |
|--------|---------|------|--------|------|
| bridge | true | true | true | true |
| blockExplorer | true | true | true | true |
| monitoring | false | true | true | true |
| crossTrade | false | false | true | true |
| uptimeService | false | true | true | true |

### Genesis Predeploys

| Preset | Base OP (13) | DeFi (5) | Gaming (4) |
|--------|-------------|----------|------------|
| general | yes | no | no |
| defi | yes | yes | no |
| gaming | yes | no | yes |
| full | yes | yes | yes |

**DeFi contracts:** UniswapV3Factory, UniswapV3SwapRouter, UniswapV3NonfungiblePositionManager, USDCBridge, WrappedETH
**Gaming contracts:** VRF, VRFCoordinator, EntryPoint, Paymaster

### Fee Tokens

| Preset | Tokens |
|--------|--------|
| general | TON, ETH, USDT, USDC |
| defi | TON, ETH, USDT, USDC |
| gaming | TON, ETH, USDT, USDC |
| full | TON, ETH, USDT, USDC |

**DISCREPANCY NOTE:** PROJECT.md 비교표에서는 General이 "TON, ETH only"라고 기재되어 있으나, Go 소스의 `DefaultPresetDefinitions`에서는 **4개 Preset 모두** `["TON", "ETH", "USDT", "USDC"]`를 지원한다. Golden JSON은 Go 소스(source of truth)를 따른다.

### Infrastructure-Specific Behavior (from preset_deploy.go)

| Behavior | Local | AWS |
|----------|-------|-----|
| AWS credential validation | Skipped | Required |
| Deploy request Validate() | Skipped | Executed |
| InfraProvider field | "local" | "aws" |
| Mainnet challenge period | Forced to 6048000 | Forced to 6048000 |

## BIP44 Key Derivation Details

기존 `keystore.ts`에서 확인한 정확한 경로:

| Role | Index | BIP44 Path |
|------|-------|------------|
| admin | 0 | m/44'/60'/0'/0/0 |
| proposer | 1 | m/44'/60'/0'/0/1 |
| batcher | 2 | m/44'/60'/0'/0/2 |
| challenger | 3 | m/44'/60'/0'/0/3 |
| sequencer | 4 | m/44'/60'/0'/0/4 |

**Test vector recommendation:** `abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about` (12-word mnemonic). 이미 keystore.test.ts에서 사용 중이며 결정론적 주소를 제공한다.

**Note on FUND-01:** Requirements에서는 "admin/sequencer/batcher/proposer 4개 주소"라고 되어 있으나, keystore.ts는 실제로 **5개 role** (admin, proposer, batcher, challenger, sequencer)을 파생한다. 테스트는 5개 전부 검증해야 한다.

## Funding Logic Research

FUND-02/03/04에 대한 balance check 로직은 trh-platform에 아직 독립적인 함수로 존재하지 않을 수 있다. 확인 결과:

1. **Balance threshold**: trh-sdk와 trh-backend에서 관리하는 로직이며, trh-platform(Electron app)에서는 UI를 통해 표시만 할 가능성이 높다.
2. **Mock approach**: 잔액 확인 로직이 trh-platform에 없다면, 테스트 대상은 "배포 요청 시 잔액 기준 검증을 하는 함수"를 새로 작성하거나, 해당 로직이 있는 위치를 찾아 테스트해야 한다.
3. **Recommendation**: 잔액 검증 로직을 `tests/` 내에서 테스트 가능한 순수 함수로 추출하여 작성한다. 이 함수는 향후 실제 코드에서 import될 수 있다.

## Vitest Configuration Change

현재 `vitest.config.mts`:
```typescript
include: ['src/**/*.test.{ts,tsx}']
```

필요한 변경:
```typescript
include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}']
```

주의사항:
- `tests/` 의 테스트는 `// @vitest-environment node`를 명시해야 함 (기본값이 happy-dom)
- 또는 vitest.config.mts에서 tests/ 경로에 대해 별도 environment 설정 가능

## Common Pitfalls

### Pitfall 1: PROJECT.md와 Go 소스 불일치
**What goes wrong:** PROJECT.md 비교표를 기대값으로 사용하면 실제 Go 소스와 다른 테스트가 작성된다.
**Why it happens:** PROJECT.md가 최초 설계 시점의 값을 반영하고, Go 소스가 이후 변경되었을 수 있다.
**How to avoid:** 반드시 Go 소스의 `DefaultPresetDefinitions`에서 추출한 golden JSON을 기대값으로 사용한다.
**Warning signs:** Fee Token이 General에서 TON/ETH만 있다고 가정하면 테스트 실패.

### Pitfall 2: happy-dom에서 Node.js 전용 테스트 실행
**What goes wrong:** tests/ 디렉토리의 테스트가 happy-dom environment에서 실행되면 `fs`, `path` 등 Node API를 사용하는 코드에서 에러 발생.
**Why it happens:** vitest.config.mts의 기본 environment가 happy-dom.
**How to avoid:** 모든 tests/ 파일에 `// @vitest-environment node` 주석 추가하거나, vitest workspace config 사용.
**Warning signs:** `ReferenceError: fs is not defined` 또는 유사 에러.

### Pitfall 3: Go slice append의 전역 변수 오염
**What goes wrong:** Go 소스의 `defiPredeploys = append(opPredeploys, ...)` 패턴은 Go에서 slice header를 공유할 수 있어 의도치 않은 상호 오염 가능성이 있다.
**Why it happens:** Go의 `append`가 기존 slice의 capacity 내에서 작동하면 원본이 변경될 수 있다.
**How to avoid:** Golden JSON 생성 시 각 preset의 predeploys를 독립적으로 직렬화하여 확인. 실제로는 `var` 초기화 시점에 한 번만 실행되므로 runtime에서는 문제없지만, 값 자체를 검증해야 한다.
**Warning signs:** general preset에 DeFi/Gaming predeploys가 포함되어 나옴.

### Pitfall 4: Funding 로직의 위치 불명확
**What goes wrong:** FUND-02/03/04 테스트를 작성하려는데 검증 대상 함수가 trh-platform에 존재하지 않을 수 있다.
**Why it happens:** 잔액 검증은 trh-backend 또는 trh-sdk에서 수행될 수 있다.
**How to avoid:** 순수 함수로 잔액 검증 로직을 작성하고, 테스트에서 이 함수를 직접 import하여 검증. 이후 실제 코드에 통합.
**Warning signs:** 테스트 대상 함수를 찾을 수 없어 mock만 검증하게 됨.

## Code Examples

### Golden JSON 생성 Go 테스트 (trh-backend에 추가)

```go
// trh-backend/pkg/services/thanos/presets/export_test.go
package presets_test

import (
    "encoding/json"
    "os"
    "testing"

    "github.com/tokamak-network/trh-backend/pkg/services/thanos/presets"
)

func TestExportPresetFixtures(t *testing.T) {
    svc := presets.NewService()
    defs := svc.ListAll()

    result := make(map[string]presets.Definition, len(defs))
    for _, def := range defs {
        result[def.ID] = def
    }

    data, err := json.MarshalIndent(result, "", "  ")
    if err != nil {
        t.Fatalf("failed to marshal presets: %v", err)
    }

    outPath := os.Getenv("PRESET_FIXTURE_OUT")
    if outPath == "" {
        outPath = "presets.json"
    }

    if err := os.WriteFile(outPath, data, 0644); err != nil {
        t.Fatalf("failed to write fixture: %v", err)
    }
    t.Logf("Wrote preset fixtures to %s (%d bytes)", outPath, len(data))
}
```

### Funding Threshold 순수 함수

```typescript
// tests/helpers/funding.ts
export interface FundingThresholds {
  testnet: bigint;
  mainnet: bigint;
}

export const DEFAULT_THRESHOLDS: FundingThresholds = {
  testnet: 500000000000000000n,  // 0.5 ETH
  mainnet: 2000000000000000000n, // 2.0 ETH
};

export type NetworkType = 'testnet' | 'mainnet';

export function getMinBalance(network: NetworkType): bigint {
  return network === 'mainnet'
    ? DEFAULT_THRESHOLDS.mainnet
    : DEFAULT_THRESHOLDS.testnet;
}

export function validateFunding(
  balances: Record<string, bigint>,
  network: NetworkType,
): { passed: boolean; insufficient: string[] } {
  const minBalance = getMinBalance(network);
  const insufficient: string[] = [];

  for (const [role, balance] of Object.entries(balances)) {
    if (balance < minBalance) {
      insufficient.push(role);
    }
  }

  return { passed: insufficient.length === 0, insufficient };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spectron (Electron E2E) | Playwright _electron.launch() | 2023 | Spectron 폐기, Playwright가 유일한 옵션 |
| vi.mock() + 수동 fixture | Golden JSON + Zod validation | This project | Mock fidelity drift 방지 |
| Jest | Vitest | Already migrated | ESM 네이티브, 10x 빠른 실행 |

## Open Questions

1. **Funding 잔액 검증 로직의 위치**
   - What we know: PROJECT.md에 testnet 0.5 ETH, mainnet 2 ETH 기준이 명시됨
   - What's unclear: 이 로직이 trh-platform에 이미 구현되어 있는지, trh-backend에만 있는지
   - Recommendation: 순수 함수로 작성하여 tests/에서 직접 테스트. 기존 코드에 있으면 import.

2. **Go golden JSON 생성 시점**
   - What we know: D-04에서 trh-sdk(또는 trh-backend)에 Go 테스트 추가 결정
   - What's unclear: trh-backend에 추가할지 trh-sdk에 추가할지. Preset 정의는 trh-backend에 있음.
   - Recommendation: trh-backend/pkg/services/thanos/presets/에 export_test.go 추가. 실제 Preset 정의가 여기에 있으므로.

## Sources

### Primary (HIGH confidence)
- `trh-backend/pkg/services/thanos/presets/service.go` -- 4개 Preset의 정확한 정의 (직접 읽음)
- `trh-backend/pkg/services/thanos/presets/types.go` -- Definition struct (직접 읽음)
- `trh-backend/pkg/services/thanos/preset_deploy.go` -- Preset deploy 서비스 로직 (직접 읽음)
- `src/main/keystore.ts` -- BIP44 키 파생 로직 (직접 읽음)
- `src/main/keystore.test.ts` -- 기존 테스트 패턴 (직접 읽음)
- `vitest.config.mts` -- 현재 Vitest 설정 (직접 읽음)
- `package.json` -- 현재 의존성 버전 (직접 읽음)

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` -- 테스트 스택 추천 (프로젝트 내 리서치)
- `.planning/research/PITFALLS.md` -- 도메인 함정 (프로젝트 내 리서치)

### Tertiary (LOW confidence)
- PROJECT.md 비교표의 Fee Token 정보 -- Go 소스와 불일치 확인됨. **Go 소스가 source of truth.**

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - 이미 설치된 패키지 + npm registry 확인
- Architecture: HIGH - Go 소스 코드 직접 읽고 정확한 값 추출
- Pitfalls: HIGH - 실제 코드 불일치 발견하여 구체적 경고 제공

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (Go 소스가 변경되지 않는 한)
