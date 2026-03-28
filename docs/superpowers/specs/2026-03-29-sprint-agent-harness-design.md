# Sprint Agent Harness — Design Spec

**Date**: 2026-03-29
**Status**: Approved
**Reference**: https://www.anthropic.com/engineering/harness-design-long-running-apps

---

## Overview

범용 3-에이전트 스프린트 개발 워크플로우. Planner → Generator → Evaluator 루프를 Claude Code의 Agent tool 체인으로 구현하며, GSD 스킬(`/sprint`)로 호출된다. 어떤 프로젝트에서도 동작하며 GSD 프로젝트와 선택적으로 연동된다.

**핵심 원칙**: Generator와 Evaluator를 분리해 자기평가 편향을 제거하고, 각 subagent를 격리된 컨텍스트로 실행해 컨텍스트 오염을 방지한다.

---

## Invocation

```
/sprint "최종 목표"
/sprint "최종 목표" --max-sprints 6 --max-retries 3
/sprint "Phase 5 구현" --gsd-phase 5
```

**Parameters**:
- `goal` (positional, required): 전체 달성 목표
- `--max-sprints` (default: 5): 최대 스프린트 수
- `--max-retries` (default: 3): 스프린트당 Generator 최대 재시도 횟수
- `--gsd-phase` (optional): GSD 연동 시 참조할 phase 번호

---

## Architecture

```
메인 Claude (얇은 오케스트레이터)
│
│  스프린트 루프 (1 → max_sprints)
│  ┌─────────────────────────────────────────────┐
│  │                                             │
│  │  Planner subagent                           │
│  │    입력: 목표 + 이전 스프린트 요약 + 코드베이스  │
│  │    출력: .planning/sprints/N/contract.md    │
│  │                                             │
│  │  Generator subagent                         │
│  │    입력: contract.md (+ 재시도 시 eval.md)  │
│  │    동작: Edit/Write/Bash로 코드 구현         │
│  │         ↑ 재시도 (최대 max-retries)         │
│  │  Evaluator subagent                         │
│  │    입력: contract.md + 현재 코드베이스       │
│  │    동작: Playwright 실행 + 기준별 채점       │
│  │    출력: .planning/sprints/N/eval-M.md      │
│  │    PASS → summary.md → 다음 스프린트        │
│  │    FAIL → Generator 재시도                  │
│  └─────────────────────────────────────────────┘
│
└→ 목표 달성 or max-sprints 도달 → 세션 종료 보고
```

**컨텍스트 격리**: 각 subagent는 이전 대화 기록 없이 파일만으로 정보를 받는다. Agent tool의 독립 실행이 "context reset" 효과를 제공한다.

---

## File Structure

```
.planning/sprints/
  STATE.md               # 전체 세션 상태
  sprint-001/
    contract.md          # Planner 출력: 스프린트 계약
    eval-1.md            # Evaluator 첫 번째 평가
    eval-2.md            # Generator 재시도 후 재평가 (있을 경우)
    summary.md           # 스프린트 완료 요약
  sprint-002/
    ...
```

---

## Agent Roles

### Planner

**입력**: 최종 목표 + `STATE.md` + 이전 `summary.md`들 + 코드베이스 현황

**출력**: `contract.md`

```markdown
# Sprint N Contract

## Goal
이번 스프린트의 구체적 범위 (전체 목표의 한 조각)

## Success Criteria
- [ ] 항목 1 — Playwright로 검증 가능한 구체적 기준
- [ ] 항목 2
- [ ] 항목 3

## Out of Scope
이번 스프린트에서 하지 않을 것

## Context
관련 파일, 이전 스프린트 완성 항목 요약
```

**제약**: Success Criteria는 반드시 Evaluator가 Playwright 또는 테스트로 검증 가능한 형태. 주관적 표현 금지.

---

### Generator

**입력**: `contract.md` + (재시도 시) `eval-M.md`의 FAIL 항목

**동작**:
1. contract.md의 Success Criteria를 읽고 구현 범위 파악
2. Edit/Write/Bash/Read 등 모든 CC 도구로 코드 구현
3. Out of Scope 항목 미변경 확인
4. 각 기준을 직접 충족했는지 자체 점검 후 완료 신호

**재시도 시**: eval.md의 FAIL 항목과 Feedback 섹션만 읽고 최소 수정으로 수정

---

### Evaluator

**입력**: `contract.md` + 현재 코드베이스

**동작**:
1. 앱 빌드/실행 (필요 시)
2. Playwright로 Success Criteria 항목별 검증
3. 각 항목 PASS/FAIL + 증거(스크린샷, 네트워크 로그, 에러 메시지) 기록
4. Verdict 결정: 모든 항목 PASS면 PASS, 하나라도 FAIL이면 FAIL

**출력**: `eval-M.md`

```markdown
# Evaluation Sprint N — Attempt M

## Results
| Criterion | Status | Evidence |
|-----------|--------|----------|
| 항목 1    | ✅ PASS | screenshot-1.png |
| 항목 2    | ❌ FAIL | 에러 설명 |

## Verdict: FAIL

## Feedback for Generator
- `파일경로:라인번호` — 구체적 수정 방향
```

---

## Loop Control

### 메인 오케스트레이터 알고리즘

```
1. .planning/sprints/STATE.md 초기화

2. LOOP (sprint = 1 to max_sprints):
   a. Planner subagent 실행 → contract.md
   b. Generator subagent 실행
   c. retry = 1
   d. RETRY_LOOP:
      - Evaluator subagent 실행 → eval-{retry}.md
      - Verdict PASS? → summary.md 작성 → LOOP 계속
      - Verdict FAIL + retry < max_retries?
          → retry++ → Generator(피드백 포함) 재실행 → d 반복
      - Verdict FAIL + retry == max_retries?
          → Planner 재호출 (범위 축소 지시) → b부터 재시작
   e. 최종 목표 달성 확인 → 달성 시 성공 종료

3. max_sprints 도달 → 진행 상태 요약 보고
```

### 종료 조건

| 조건 | 처리 |
|------|------|
| 모든 스프린트 PASS + 최종 목표 달성 | 성공 종료, 최종 보고서 출력 |
| max_sprints 도달 | 완료된 스프린트 요약 + 미완성 항목 보고 |
| Planner가 "더 이상 분해 불가" 판단 | 사용자에게 수동 개입 요청 |

---

## STATE.md Format

```markdown
# Sprint Session State

goal: "목표 설명"
max_sprints: 5
max_retries: 3
current_sprint: 2
status: in_progress   # in_progress | completed | stalled

## Sprint Log
| Sprint | Attempts | Verdict | Summary |
|--------|----------|---------|---------|
| 1      | 1        | PASS    | 기본 UI 컴포넌트 생성 완료 |
| 2      | -        | -       | 진행 중 |
```

---

## GSD Integration

GSD 프로젝트 안에서 `--gsd-phase N` 플래그 사용 시:
- Planner가 `.planning/phases/N/` 아티팩트를 자동으로 컨텍스트로 읽음
- Sprint summary가 GSD STATE.md에도 반영됨
- GSD 없는 프로젝트에서는 무시 (범용성 유지)

---

## Skill Location

`~/.claude/plugins/cache/claude-plugins-official/superpowers/skills/sprint/`
또는 프로젝트 로컬: `.claude/skills/sprint.md`

---

## Non-Goals

- Generator가 테스트 코드를 작성하는 TDD 루프 (별도 스킬)
- 병렬 Generator 실행 (순차 실행만)
- 원격/비동기 실행 (단일 세션 내 동기 실행)
