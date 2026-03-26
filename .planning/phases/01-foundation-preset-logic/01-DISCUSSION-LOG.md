# Phase 1: Foundation & Preset Logic - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 01-foundation-preset-logic
**Areas discussed:** Test Layout, Preset Data Source, Fixture Structure

---

## Test Layout

| Option | Description | Selected |
|--------|-------------|----------|
| 완전 분리 (Recommended) | tests/는 harness 전용, 기존 src/*.test.ts는 그대로 유지 | ✓ |
| 기존 테스트 이동 | 기존 src/*.test.ts를 tests/로 이동하여 한 곳에서 관리 | |
| Vitest workspace | vitest.workspace.ts로 unit/harness 프로젝트 분리 | |

**User's choice:** 완전 분리
**Notes:** Vitest config에서 include 경로만 추가하면 충분

---

## Preset Data Source

| Option | Description | Selected |
|--------|-------------|----------|
| TS 재정의 (Recommended) | Go 코드의 Preset 값을 TS fixture로 수동 정의 | |
| Go에서 JSON 추출 | Go 테스트로 golden JSON 생성 → TS에서 읽어서 검증 | ✓ |
| preset-flow HTML 기준 | 문서화된 비교표를 fixture의 근거로 사용 | |

**User's choice:** Go에서 JSON 추출
**Notes:** 자동 동기화의 이점을 취하되 Go 테스트 → JSON export 단계 필요

---

## Fixture Structure

| Option | Description | Selected |
|--------|-------------|----------|
| 단일 JSON (Recommended) | presets.json 하나에 4개 Preset 전체 데이터 | ✓ |
| Preset별 파일 | general.json, defi.json 등 개별 파일 | |
| 계층형 구조 | common.json + preset별 override | |

**User's choice:** 단일 JSON
**Notes:** 파라메트릭 테스트와 궁합 좋고 한눈에 비교 가능

---

## Claude's Discretion

- tests/ 내부 하위 디렉토리 구조
- Zod 스키마 파일 위치 및 네이밍
- BIP44 테스트 벡터 선정

## Deferred Ideas

None
