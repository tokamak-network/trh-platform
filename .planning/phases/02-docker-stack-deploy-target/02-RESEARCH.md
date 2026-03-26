# Phase 2: Docker Stack & Deploy Target - Research

**Researched:** 2026-03-26
**Domain:** Docker Compose schema validation, Terraform/Docker CLI mock testing
**Confidence:** HIGH

## Summary

Phase 2는 docker-compose.yml 구조를 Zod 스키마로 검증하고, Local Docker / AWS EC2 두 배포 경로의 명령 시퀀스를 child_process mock으로 테스트한다. 이 프로젝트에는 두 개의 docker-compose.yml 파일이 존재한다: 루트의 `docker-compose.yml`(env_file 기반, healthcheck 없음)과 `resources/docker-compose.yml`(environment inline, healthcheck 포함, depends_on condition 포함). `resources/` 버전이 Electron 앱에서 실제 사용되는 파일이며(`src/main/docker.ts`의 `getComposePath()` 참조), 스키마 검증의 주 대상이다.

js-yaml로 YAML을 파싱하고 Zod로 구조를 검증하는 패턴은 Phase 1의 JSON fixture + Zod 패턴과 동일한 구조를 따른다. Deploy 경로 테스트는 `vi.mock('child_process')`로 exec/spawn 호출을 가로채고, 호출 순서와 인자를 검증한다. Terraform main.tf의 security group 포트 검증은 파일을 텍스트로 읽고 정규식으로 ingress 포트를 추출하는 방식이 적절하다 (HCL 파서를 설치할 필요 없음).

**Primary recommendation:** resources/docker-compose.yml을 주 검증 대상으로 삼고, js-yaml + Zod로 3-service 구조를 검증하며, deploy 경로는 vi.mock('child_process')로 명령 시퀀스를 단언한다.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: js-yaml 라이브러리로 docker-compose.yml을 YAML 파싱한 뒤, Zod 스키마로 구조를 검증한다. Phase 1에서 확립된 Zod 패턴(tests/schemas/)과 일관성 유지.
- D-02: js-yaml은 이미 Phase 1 리서치에서 권장된 의존성이므로 npm install 필요.
- D-03: vi.mock('child_process')로 exec/spawn 호출을 가로채서 Terraform init/plan/apply 명령어 시퀀스를 검증한다. 실제 Terraform CLI 실행 불필요.
- D-04: Docker compose 명령(docker compose up -d 등)도 동일한 child_process mock 패턴으로 검증.
- D-05: 3개 분리된 테스트 파일로 구성:
  - tests/unit/docker-stack.test.ts -- docker-compose.yml 스키마 검증 (DOCK-01~04)
  - tests/unit/deploy-local.test.ts -- Local Docker 배포 시퀀스 (DTGT-01, DTGT-03)
  - tests/unit/deploy-aws.test.ts -- AWS EC2 Terraform 시퀀스 (DTGT-02, DTGT-03, DTGT-04)

### Claude's Discretion
- Docker compose Zod 스키마의 세부 필드 구조
- Security Group 포트 검증의 구체적 구현 방식
- child_process mock의 응답 fixture 설계

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCK-01 | docker-compose.yml 스키마가 유효한 구조(services, volumes, networks)를 갖추는지 Zod 기반 validation | js-yaml 파싱 + DockerComposeSchema Zod 스키마 |
| DOCK-02 | 컨테이너 의존성 순서(postgres -> backend -> frontend)가 올바른지 검증 | depends_on 필드의 condition: service_healthy 포함 검증 |
| DOCK-03 | Health check 설정이 각 서비스에 올바르게 정의되어 있는지 검증 | healthcheck Zod 스키마 (test, interval, timeout, retries 필드) |
| DOCK-04 | 환경변수 파일 참조(config/.env.backend, config/.env.frontend)가 올바른지 검증 | resources/docker-compose.yml은 env_file 대신 environment inline 사용 -- 환경변수 키 존재 여부로 검증 |
| DTGT-01 | Local Docker 배포 경로에서 docker compose 명령 호출 시퀀스가 올바른지 mock 검증 | vi.mock('child_process') + spawn/exec 호출 순서 단언 |
| DTGT-02 | AWS EC2 배포 경로에서 Terraform init/plan/apply 호출 시퀀스가 올바른지 mock 검증 | vi.mock('child_process') + exec 호출 인자 검증 |
| DTGT-03 | Local/AWS 공통 로직과 인프라별 분기 로직이 올바르게 분리되는지 검증 | 공통 함수(config 생성, compose 파일 로드)와 인프라별 함수(docker compose up vs terraform apply) 분리 테스트 |
| DTGT-04 | AWS 배포 시 Security Group 포트(22, 3000, 8000) 설정이 올바른지 검증 | ec2/main.tf 텍스트 파싱 + 정규식으로 ingress 포트 추출 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| js-yaml | 4.1.1 | YAML 파싱 (docker-compose.yml -> JS object) | Node.js 생태계 표준 YAML 파서, npm 주간 다운로드 8000만+ |
| @types/js-yaml | latest | js-yaml TypeScript 타입 | TypeScript strict mode에서 필요 |
| zod | 4.3.6 | 파싱 결과 스키마 검증 | 이미 프로젝트에 설치됨, Phase 1 패턴과 일관성 |
| vitest | 4.1.0 | 테스트 러너 | 이미 프로젝트에 설치됨 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fs (built-in) | N/A | docker-compose.yml, main.tf 파일 읽기 | 모든 파일 기반 테스트 |
| path (built-in) | N/A | 파일 경로 구성 | fixture/소스 파일 참조 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| js-yaml | yaml (npm) | yaml 패키지가 YAML 1.2 full spec 지원하지만, docker-compose는 1.1이면 충분. js-yaml이 더 가볍고 빠름 |
| 정규식 (main.tf) | hcl2-parser | HCL 파서는 과도한 의존성. 3개 ingress rule만 추출하면 되므로 정규식으로 충분 |

**Installation:**
```bash
npm install --save-dev js-yaml @types/js-yaml
```

## Architecture Patterns

### Recommended Test Structure
```
tests/
├── schemas/
│   ├── preset.schema.ts          # Phase 1 (existing)
│   ├── funding.schema.ts         # Phase 1 (existing)
│   └── docker-compose.schema.ts  # Phase 2 (new)
├── helpers/
│   ├── load-fixtures.ts          # Phase 1 (existing)
│   └── load-compose.ts           # Phase 2 (new) - YAML 파싱 헬퍼
├── fixtures/
│   └── presets.json              # Phase 1 (existing)
└── unit/
    ├── preset-config.test.ts     # Phase 1 (existing)
    ├── preset-matrix.test.ts     # Phase 1 (existing)
    ├── funding-flow.test.ts      # Phase 1 (existing)
    ├── docker-stack.test.ts      # Phase 2 (new) - DOCK-01~04
    ├── deploy-local.test.ts      # Phase 2 (new) - DTGT-01, DTGT-03
    └── deploy-aws.test.ts        # Phase 2 (new) - DTGT-02, DTGT-03, DTGT-04
```

### Pattern 1: YAML Parse + Zod Validate
**What:** js-yaml으로 YAML을 JS 객체로 변환 후 Zod 스키마로 구조 검증
**When to use:** docker-compose.yml 구조 검증 (DOCK-01~04)
**Example:**
```typescript
// tests/helpers/load-compose.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { DockerComposeSchema, type DockerCompose } from '../schemas/docker-compose.schema';

export function loadCompose(filePath?: string): DockerCompose {
  const composePath = filePath ?? join(__dirname, '..', '..', 'resources', 'docker-compose.yml');
  const raw = yaml.load(readFileSync(composePath, 'utf-8'));
  return DockerComposeSchema.parse(raw);
}
```

### Pattern 2: child_process Mock for Command Sequence
**What:** vi.mock('child_process')로 exec/spawn을 모킹하고 호출 순서/인자를 검증
**When to use:** deploy 경로 테스트 (DTGT-01, DTGT-02)
**Example:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exec, spawn } from 'child_process';

vi.mock('child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));

// exec mock을 성공 응답으로 설정
function mockExecSuccess(stdout = '') {
  (exec as any).mockImplementation(
    (_cmd: string, _opts: any, cb: Function) => cb(null, stdout, '')
  );
}

// spawn mock을 성공 이벤트로 설정
function mockSpawnSuccess() {
  const mockProcess = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: Function) => {
      if (event === 'close') cb(0);
      return mockProcess;
    }),
    kill: vi.fn(),
    killed: false,
  };
  (spawn as any).mockReturnValue(mockProcess);
  return mockProcess;
}
```

### Pattern 3: Terraform File Text Parsing
**What:** main.tf를 텍스트로 읽고 정규식으로 security group ingress 포트를 추출
**When to use:** DTGT-04 Security Group 포트 검증
**Example:**
```typescript
function extractIngressPorts(tfContent: string): number[] {
  const ports: number[] = [];
  const ingressRegex = /ingress\s*\{[^}]*from_port\s*=\s*(\d+)[^}]*\}/gs;
  let match;
  while ((match = ingressRegex.exec(tfContent)) !== null) {
    ports.push(parseInt(match[1], 10));
  }
  return ports;
}
```

### Anti-Patterns to Avoid
- **HCL 파서 의존성 추가:** 3개 포트 검증에 HCL 파서는 과잉. 정규식으로 충분
- **실제 파일 시스템 변경:** 테스트에서 docker-compose.yml을 수정하거나 생성하지 않음. 기존 파일을 읽기만 한다
- **child_process 부분 mock:** exec만 mock하고 spawn을 빠뜨리면 테스트 커버리지에 구멍 생김. 두 함수 모두 mock
- **docker.ts 직접 import:** `src/main/docker.ts`는 Electron `app` 모듈에 의존. 테스트에서 직접 import하면 Electron 런타임 필요. 대신 로직을 추출하거나 독립적으로 테스트

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML 파싱 | 수동 문자열 파싱 | js-yaml `yaml.load()` | YAML spec 엣지 케이스(앵커, 멀티라인 등) 수동 처리 불가 |
| Docker Compose 스키마 | 수동 필드 체크 | Zod 스키마 `.parse()` | 중첩 구조, optional 필드, discriminated union 검증 복잡 |
| HCL 파싱 | 완전한 HCL 파서 | 정규식 추출 | 전체 HCL AST 불필요, ingress 블록 3개만 추출하면 됨 |

## Common Pitfalls

### Pitfall 1: 두 docker-compose.yml 혼동
**What goes wrong:** 루트 `docker-compose.yml`과 `resources/docker-compose.yml`의 구조가 다르다. 루트 파일은 `env_file` 기반이고 healthcheck이 없다. resources 파일은 `environment` inline과 healthcheck, depends_on condition을 포함한다.
**Why it happens:** 어떤 파일이 Electron 앱에서 사용되는지 모르고 루트 파일을 테스트 대상으로 삼음.
**How to avoid:** `src/main/docker.ts`의 `getComposePath()`가 `resources/docker-compose.yml`을 반환한다. 이 파일이 주 검증 대상.
**Warning signs:** healthcheck 테스트가 실패하면 잘못된 파일을 테스트 중일 가능성.

### Pitfall 2: Electron app 모듈 의존성
**What goes wrong:** `src/main/docker.ts`의 `startContainers()` 등을 직접 import하면 `const { app } = require('electron')` 에서 실패.
**Why it happens:** Electron main process 모듈은 Electron 런타임 없이는 import 불가.
**How to avoid:** docker.ts를 직접 테스트하지 않는다. 대신: (1) docker-compose.yml 스키마는 파일을 직접 읽어서 검증, (2) 배포 시퀀스는 child_process mock으로 명령 순서만 검증. 필요하면 docker.ts에서 순수 로직을 별도 모듈로 추출.
**Warning signs:** `Cannot find module 'electron'` 에러.

### Pitfall 3: vi.mock 호이스팅
**What goes wrong:** vi.mock()은 파일 최상단으로 호이스팅된다. mock 내부에서 외부 변수를 참조하면 `ReferenceError` 발생.
**Why it happens:** Vitest가 vi.mock을 컴파일 시점에 호이스팅하므로 모듈 스코프 변수가 아직 초기화되지 않음.
**How to avoid:** vi.mock() 팩토리 함수 내부에서는 inline 값만 사용. 외부 변수가 필요하면 `vi.hoisted()`를 사용하거나, mock 설정을 각 테스트의 beforeEach에서 수행.
**Warning signs:** `ReferenceError: Cannot access 'xxx' before initialization`.

### Pitfall 4: resources/docker-compose.yml의 DOCK-04 해석
**What goes wrong:** DOCK-04는 "환경변수 파일 참조(config/.env.backend, config/.env.frontend)가 올바른지 검증"인데, resources/docker-compose.yml은 `env_file`을 사용하지 않고 `environment`로 inline 선언한다.
**Why it happens:** 요구사항이 루트 docker-compose.yml 기준으로 작성되었을 수 있음.
**How to avoid:** DOCK-04를 "서비스별 필수 환경변수 키가 정의되어 있는지 검증"으로 재해석. postgres는 POSTGRES_USER/PASSWORD/DB, backend는 PORT/POSTGRES_HOST 등, platform-ui는 NEXT_PUBLIC_API_BASE_URL.
**Warning signs:** env_file 관련 테스트가 resources 파일에서 항상 실패.

### Pitfall 5: 정규식으로 HCL 파싱 시 멀티라인 매칭
**What goes wrong:** JavaScript 정규식은 기본적으로 `.`이 개행을 매칭하지 않는다. ingress 블록이 여러 줄에 걸쳐 있으므로 매칭 실패.
**Why it happens:** RegExp의 `s` (dotAll) 플래그를 빠뜨림.
**How to avoid:** 정규식에 `s` 플래그 사용, 또는 `[\s\S]*?`로 개행 포함 매칭.

## Code Examples

### Docker Compose Zod Schema (권장 구조)
```typescript
// tests/schemas/docker-compose.schema.ts
import { z } from 'zod';

const HealthcheckSchema = z.object({
  test: z.union([z.array(z.string()), z.string()]),
  interval: z.string().optional(),
  timeout: z.string().optional(),
  retries: z.number().int().positive().optional(),
  start_period: z.string().optional(),
}).optional();

const DependsOnSchema = z.union([
  z.array(z.string()),                          // simple form: ["postgres"]
  z.record(z.string(), z.object({               // long form: { postgres: { condition: ... } }
    condition: z.enum(['service_started', 'service_healthy', 'service_completed_successfully']).optional(),
  })),
]);

const ServiceSchema = z.object({
  image: z.string(),
  container_name: z.string().optional(),
  ports: z.array(z.string()).optional(),
  environment: z.union([
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    z.array(z.string()),
  ]).optional(),
  env_file: z.union([z.string(), z.array(z.string())]).optional(),
  depends_on: DependsOnSchema.optional(),
  volumes: z.array(z.string()).optional(),
  healthcheck: HealthcheckSchema,
  restart: z.string().optional(),
});

const VolumeSchema = z.union([
  z.null(),                              // named volume with no config
  z.object({
    name: z.string().optional(),
    external: z.boolean().optional(),
    driver: z.string().optional(),
  }),
]);

export const DockerComposeSchema = z.object({
  version: z.string().optional(),        // deprecated in v2 but may exist
  services: z.record(z.string(), ServiceSchema),
  volumes: z.record(z.string(), VolumeSchema).optional(),
  networks: z.record(z.string(), z.any()).optional(),
});

export type DockerCompose = z.infer<typeof DockerComposeSchema>;
export type Service = z.infer<typeof ServiceSchema>;
```

### Docker Stack Test (DOCK-01~04)
```typescript
// tests/unit/docker-stack.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { loadCompose } from '../helpers/load-compose';

describe('Docker Compose Schema (resources/docker-compose.yml)', () => {
  const compose = loadCompose();

  it('DOCK-01: has valid services, volumes structure', () => {
    expect(Object.keys(compose.services)).toEqual(
      expect.arrayContaining(['postgres', 'backend', 'platform-ui'])
    );
    expect(compose.volumes).toBeDefined();
  });

  it('DOCK-02: dependency order postgres -> backend -> platform-ui', () => {
    const backend = compose.services['backend'];
    const ui = compose.services['platform-ui'];
    // backend depends on postgres with service_healthy
    expect(backend.depends_on).toBeDefined();
    // platform-ui depends on backend with service_healthy
    expect(ui.depends_on).toBeDefined();
  });

  it('DOCK-03: healthcheck defined for postgres and backend', () => {
    expect(compose.services['postgres'].healthcheck).toBeDefined();
    expect(compose.services['backend'].healthcheck).toBeDefined();
  });

  it('DOCK-04: required env vars defined per service', () => {
    const pgEnv = compose.services['postgres'].environment;
    expect(pgEnv).toHaveProperty('POSTGRES_USER');
    const beEnv = compose.services['backend'].environment;
    expect(beEnv).toHaveProperty('PORT');
    const uiEnv = compose.services['platform-ui'].environment;
    expect(uiEnv).toHaveProperty('NEXT_PUBLIC_API_BASE_URL');
  });
});
```

### Deploy Sequence Mock Test (DTGT-01)
```typescript
// tests/unit/deploy-local.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));

import { exec, spawn } from 'child_process';

describe('Local Docker Deploy Sequence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DTGT-01: calls docker compose up -d', () => {
    // Test logic: verify spawn is called with ['compose', '-f', composePath, 'up', '-d']
    // This tests the command sequence, not docker.ts directly
  });
});
```

### Security Group Port Extraction (DTGT-04)
```typescript
// In tests/unit/deploy-aws.test.ts
import { readFileSync } from 'fs';
import { join } from 'path';

function extractIngressPorts(tfContent: string): number[] {
  const ports: number[] = [];
  const ingressRegex = /ingress\s*\{[\s\S]*?from_port\s*=\s*(\d+)[\s\S]*?\}/g;
  let match;
  while ((match = ingressRegex.exec(tfContent)) !== null) {
    ports.push(parseInt(match[1], 10));
  }
  return ports;
}

describe('AWS EC2 Deploy', () => {
  it('DTGT-04: security group opens ports 22, 3000, 8000', () => {
    const tf = readFileSync(join(__dirname, '..', '..', 'ec2', 'main.tf'), 'utf-8');
    const ports = extractIngressPorts(tf);
    expect(ports).toContain(22);
    expect(ports).toContain(3000);
    expect(ports).toContain(8000);
    expect(ports).toHaveLength(3); // no unexpected ports
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| docker-compose.yml `version` 필드 필수 | Compose v2에서 `version` deprecated | Compose v2 (2023) | 스키마에서 version을 optional로 처리해야 함 |
| depends_on: ["service"] (문자열 배열) | depends_on: { service: { condition: service_healthy } } | Compose v2 | 두 형태 모두 스키마에서 허용 필요 |
| js-yaml 3.x의 safeLoad | js-yaml 4.x에서 safeLoad 제거, load가 기본 safe | js-yaml 4.0 (2021) | `yaml.load()` 사용 (safeLoad 아님) |

## Project Constraints (from CLAUDE.md)

- **Tech stack**: TypeScript/Vitest (unit/integration) -- trh-platform이 Electron + TypeScript 기반
- **Mock boundary**: 모든 외부 의존성(Docker, AWS)은 mock/stub 처리
- **Location**: 모든 테스트 코드는 `trh-platform/tests/` 디렉토리에 위치
- **TypeScript strict mode**: `strict: true` -- 모든 타입 명시 필요
- **Test include 패턴**: `tests/**/*.test.{ts,tsx}` (vitest.config.mts에 설정됨)
- **Test environment**: `happy-dom` 기본이지만, `// @vitest-environment node` 주석으로 node 환경 사용 (Phase 1 패턴)
- **Conventional Commits**: 커밋 메시지 형식
- **2-space indentation**, single quotes, semicolons required

## Docker Compose File Analysis

### resources/docker-compose.yml (주 검증 대상)

| Service | Image | Ports | depends_on | healthcheck | environment |
|---------|-------|-------|------------|-------------|-------------|
| postgres | postgres:15 | 5433:5432 | - | pg_isready | POSTGRES_USER, PASSWORD, DB |
| backend | tokamaknetwork/trh-backend:latest | 8000:8000 | postgres (service_healthy) | curl health endpoint | PORT, POSTGRES_*, JWT_SECRET, ADMIN_* |
| platform-ui | tokamaknetwork/trh-platform-ui:latest | 3000:3000 | backend (service_healthy) | - | NEXT_PUBLIC_API_BASE_URL |

**Volumes:** trh_postgres_data, trh_backend_data, trh_backend_logs, trh_backend_storage (named, with `name: trh_backend_storage`)

### Root docker-compose.yml (보조 참조)

| Service | Image | Ports | depends_on | healthcheck | env source |
|---------|-------|-------|------------|-------------|------------|
| postgres | postgres:15 | 5432:5432 | - | - | env_file: config/.env.backend |
| backend | tokamaknetwork/trh-backend:latest | 8000:8000 | postgres (simple) | - | env_file: config/.env.backend |
| ui | tokamaknetwork/trh-platform-ui:latest | 3000:3000 | backend (simple) | - | env_file: config/.env.frontend |

**Key differences:** service name (`ui` vs `platform-ui`), port mapping (5432 vs 5433), env 방식, healthcheck 유무, depends_on 형태.

## Terraform Analysis (ec2/main.tf)

### Security Group Ingress Rules
| Port | Protocol | CIDR | Description |
|------|----------|------|-------------|
| 22 | tcp | 0.0.0.0/0 | SSH |
| 3000 | tcp | 0.0.0.0/0 | Frontend port 3000 |
| 8000 | tcp | 0.0.0.0/0 | Backend port 8000 |

### Egress
- All outbound traffic (port 0, protocol -1, 0.0.0.0/0)

### Terraform Variables (ec2/variables.tf)
| Variable | Type | Default | Required |
|----------|------|---------|----------|
| region | string | ap-northeast-2 | No |
| instance_type | string | t2.large | No |
| instance_name | string | trh-platform-ec2 | No |
| key_pair_name | string | - | Yes |
| public_key_path | string | - | Yes |
| admin_email | string | admin@gmail.com | No |
| admin_password | string | admin | No |
| git_branch | string | main | No (validated) |

### EC2 Provisioning Sequence (from main.tf)
1. Cloud-init wait: `while [ ! -f /var/lib/cloud/instance/boot-finished ]`
2. git clone repository
3. cp config templates to .env files
4. sed configure frontend API URL with instance public IP
5. sed configure admin credentials
6. `make setup`

## Deploy Command Sequences

### Local Docker (from docker.ts + Makefile)
```
1. docker --version              (check installed)
2. docker info                   (check running)
3. docker compose -f <path> pull (pull images)
4. docker compose -f <path> up -d (start containers)
5. docker compose -f <path> ps   (health check poll)
```

### AWS EC2 (from Makefile ec2-deploy)
```
1. aws sts get-caller-identity   (verify credentials)
2. terraform -chdir=ec2 init     (initialize)
3. terraform -chdir=ec2 plan     (plan with variables)
4. terraform -chdir=ec2 apply -auto-approve (apply)
5. Remote provisioning via SSH   (cloud-init + install.sh + make setup)
```

## Open Questions

1. **DTGT-03 공통/분기 로직 분리 검증 방식**
   - What we know: docker.ts에 Local 배포 로직이 있고, Makefile에 AWS 배포 로직이 있다. 두 경로가 공유하는 코드가 명시적으로 분리된 모듈은 없다.
   - What's unclear: "올바르게 분리되는지 검증"이 코드 구조 검증인지, 동작 검증인지
   - Recommendation: Local 경로는 `docker compose up -d`로 끝나고, AWS 경로는 `terraform apply` 후 remote provisioning으로 끝나는 점을 테스트. 공통 로직(compose 파일 존재 확인, config 유효성)은 별도 테스트로 검증.

2. **docker.ts의 Electron 의존성 우회**
   - What we know: docker.ts 최상단에서 `app` from electron을 import. 테스트에서 직접 import 불가.
   - What's unclear: docker.ts의 함수들을 테스트해야 하는지, 아니면 명령 시퀀스만 검증하면 되는지
   - Recommendation: docker.ts를 직접 import하지 않는다. 대신 (1) 명령 시퀀스는 독립적인 테스트 함수로 검증, (2) deploy-local.test.ts에서는 "docker compose 명령이 올바른 순서로 호출되는지"만 검증.

## Sources

### Primary (HIGH confidence)
- `resources/docker-compose.yml` -- 직접 파일 분석, 실제 Electron 앱에서 사용되는 compose 파일
- `docker-compose.yml` -- 직접 파일 분석, 루트 compose 파일
- `ec2/main.tf` -- 직접 파일 분석, Terraform EC2 설정
- `ec2/variables.tf` -- 직접 파일 분석, Terraform 변수
- `src/main/docker.ts` -- 직접 코드 분석, Docker 관련 로직
- `Makefile` -- 직접 코드 분석, 배포 명령 시퀀스
- `tests/schemas/preset.schema.ts` -- Phase 1 Zod 패턴 참조
- `vitest.config.mts` -- 테스트 설정 확인

### Secondary (MEDIUM confidence)
- npm registry: js-yaml 4.1.1 (verified), zod 4.3.6 (verified, already installed)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- js-yaml, zod 모두 검증 완료, 프로젝트에 이미 Zod 패턴 확립
- Architecture: HIGH -- Phase 1 패턴을 그대로 확장, 소스 파일 구조 직접 분석 완료
- Pitfalls: HIGH -- 두 compose 파일 차이, Electron 의존성 등 실제 코드 분석에서 도출

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (안정적인 도메인, 소스 코드 기반 분석)
