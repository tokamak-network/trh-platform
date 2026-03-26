# Phase 2: Docker Stack & Deploy Target - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Docker compose 스키마의 유효성을 검증하고, Local Docker와 AWS EC2 두 배포 경로의 명령 시퀀스가 올바른지 mock 기반으로 테스트한다. 실제 Docker daemon이나 AWS API 호출 없이 로직 정합성만 검증.

</domain>

<decisions>
## Implementation Decisions

### Docker Compose Parsing
- **D-01:** js-yaml 라이브러리로 docker-compose.yml을 YAML 파싱한 뒤, Zod 스키마로 구조를 검증한다. Phase 1에서 확립된 Zod 패턴(tests/schemas/)과 일관성 유지.
- **D-02:** js-yaml은 이미 Phase 1 리서치에서 권장된 의존성이므로 npm install 필요.

### Terraform Mock Strategy
- **D-03:** vi.mock('child_process')로 exec/spawn 호출을 가로채서 Terraform init/plan/apply 명령어 시퀀스를 검증한다. 실제 Terraform CLI 실행 불필요.
- **D-04:** Docker compose 명령(docker compose up -d 등)도 동일한 child_process mock 패턴으로 검증.

### Test File Structure
- **D-05:** 3개 분리된 테스트 파일로 구성:
  - `tests/unit/docker-stack.test.ts` — docker-compose.yml 스키마 검증 (DOCK-01~04)
  - `tests/unit/deploy-local.test.ts` — Local Docker 배포 시퀀스 (DTGT-01, DTGT-03)
  - `tests/unit/deploy-aws.test.ts` — AWS EC2 Terraform 시퀀스 (DTGT-02, DTGT-03, DTGT-04)

### Claude's Discretion
- Docker compose Zod 스키마의 세부 필드 구조
- Security Group 포트 검증의 구체적 구현 방식
- child_process mock의 응답 fixture 설계

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Docker Compose
- `docker-compose.yml` — 실제 compose 파일, 스키마 검증 대상
- `resources/docker-compose.yml` — 리소스 버전 compose 파일

### Deploy Infrastructure
- `ec2/main.tf` — Terraform EC2 instance, security group, key pair 정의
- `ec2/variables.tf` — Terraform input variables
- `Makefile` — ec2-deploy, ec2-setup 등 배포 명령 정의
- `src/main/docker.ts` — Docker 관련 Electron main process 로직

### Phase 1 Patterns (재사용)
- `tests/schemas/preset.schema.ts` — Zod 스키마 패턴 참조
- `tests/helpers/load-fixtures.ts` — fixture 로딩 패턴 참조
- `vitest.config.mts` — Vitest 설정

### Research
- `.planning/research/STACK.md` — js-yaml, Zod 추천
- `.planning/research/ARCHITECTURE.md` — mock boundary 설계

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/schemas/` — Phase 1에서 확립된 Zod 스키마 패턴, compose 스키마도 동일 구조로 작성
- `tests/helpers/` — fixture 로딩 패턴 재사용 가능
- `tests/fixtures/presets.json` — Phase 1 fixture 참조 패턴

### Established Patterns
- vi.mock 패턴 (Phase 1에서 ethers mock 사용)
- describe/it BDD 구조, Zod schema.parse() 기반 검증
- tests/unit/ 하위 디렉토리에 테스트 파일 배치

### Integration Points
- `docker-compose.yml` 및 `resources/docker-compose.yml` 파싱
- `ec2/main.tf` 파싱 (HCL → security group 포트 검증)
- `src/main/docker.ts`의 exec 호출 패턴 참조

</code_context>

<specifics>
## Specific Ideas

- Docker compose 스키마는 services 키 내 depends_on, healthcheck, environment 필드의 존재와 구조를 검증
- Terraform main.tf에서 security group의 ingress rule 포트(22, 3000, 8000)를 정규식으로 추출하여 검증
- Local 배포: docker compose up -d → health check poll → ready 시퀀스
- AWS 배포: terraform init → terraform plan → terraform apply → SSH provisioning 시퀀스

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-docker-stack-deploy-target*
*Context gathered: 2026-03-26*
