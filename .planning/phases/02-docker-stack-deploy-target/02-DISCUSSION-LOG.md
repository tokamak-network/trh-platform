# Phase 2: Docker Stack & Deploy Target - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-03-26
**Phase:** 02-docker-stack-deploy-target
**Areas discussed:** Compose Parsing, Terraform Mock, Test File Structure

---

## Compose Parsing

| Option | Description | Selected |
|--------|-------------|----------|
| js-yaml + Zod (Recommended) | js-yaml로 YAML 파싱 → Zod 스키마로 구조 검증 | ✓ |
| 정규식 기반 | YAML 파싱 없이 문자열 매칭으로 필수 필드 확인 | |
| Docker API | docker compose config 명령어로 검증 (Docker daemon 필요) | |

**User's choice:** js-yaml + Zod
**Notes:** Phase 1 패턴과 일관성 유지

---

## Terraform Mock

| Option | Description | Selected |
|--------|-------------|----------|
| child_process mock (Recommended) | vi.mock('child_process')로 exec/spawn 가로채서 시퀀스 검증 | ✓ |
| Terraform fixture | terraform plan -out=plan.json 출력을 golden fixture로 분석 | |
| You decide | Claude 재량권 | |

**User's choice:** child_process mock
**Notes:** Docker compose 명령도 동일 패턴으로 검증

---

## Test File Structure

| Option | Description | Selected |
|--------|-------------|----------|
| 분리된 테스트 파일 (Recommended) | docker-stack.test.ts + deploy-local.test.ts + deploy-aws.test.ts | ✓ |
| 통합 파일 | 하나의 deploy-target.test.ts에서 describe 블록 분리 | |
| You decide | Claude 재량권 | |

**User's choice:** 분리된 테스트 파일

## Claude's Discretion

- Docker compose Zod 스키마 세부 필드 구조
- Security Group 포트 검증 구현 방식
- child_process mock 응답 fixture 설계

## Deferred Ideas

None
