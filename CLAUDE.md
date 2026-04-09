# CLAUDE.md

이 파일은 Claude Code가 이 저장소를 작업할 때 참조하는 지침이다.

## 프로젝트 개요

**TRH Platform** — Electron 데스크톱 앱. Docker Compose로 PostgreSQL + Node.js 백엔드 + Next.js 프론트엔드를 로컬에서 실행한다.

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- PostgreSQL: localhost:5432 (postgres/postgres)
- Default admin: admin@gmail.com / admin

## 주요 명령어

```bash
make setup       # 초기 설정: config 생성 + docker compose 실행 + backend 초기화
make up          # 전체 서비스 시작
make down        # 컨테이너 중지 (확인 절차 있음)
make clean       # 중지 + 볼륨 삭제
make status      # 컨테이너 상태 확인
make logs        # 로그 스트리밍
make update      # 최신 이미지 pull + 재시작
make config      # 환경 설정 대화형 구성
```

## 설정 파일

| 파일 | 용도 |
|------|------|
| `config/.env.docker` | Docker 이미지 오버라이드 (기본 비어있음; `:latest` 태그 사용) |
| `config/.env.backend` | PostgreSQL, JWT, 기본 관리자 계정 |
| `config/.env.frontend` | `NEXT_PUBLIC_API_BASE_URL` |

템플릿은 `config/*.template`. `make config` 또는 `make setup`으로 생성.

## 트러블슈팅

- 서비스 시작 실패 → `make logs`, Docker 실행 여부 확인
- DB 연결 실패 → `config/.env.backend`의 PostgreSQL 자격증명 확인
- 프론트엔드 → 백엔드 연결 실패 → `config/.env.frontend`의 `NEXT_PUBLIC_API_BASE_URL` 확인

## Git 워크플로

- Conventional Commits 형식
- 브랜치: `feature/xxx`, `fix/xxx`, `test/xxx`
- `main` = 프로덕션 릴리즈 브랜치

## 워크플로

- **계획 필요 시**: `/gsd:discuss-phase`
- **버그 수정**: `/gsd:debug`
- **기능 구현**: `/gsd:execute-phase`
- **완료 전**: `/gsd:verify-work`

### Wiki 업데이트 조건

새 컴포넌트/개념/인터페이스, 설계 결정(Why), 트러블슈팅 해결책, 기존 wiki 충돌 시 → `trh-wiki` ingest:
1. `wiki/` 페이지 생성/수정
2. `wiki/log.md` 항목 추가
3. commit + push

## GSD 워크플로 적용 규칙

파일 변경 전 GSD 커맨드로 시작할 것:
- `/gsd:quick` — 작은 수정, 문서
- `/gsd:debug` — 버그 조사
- `/gsd:execute-phase` — 계획된 phase 작업

## 참조 문서

@docs/claude/conventions.md
@docs/claude/architecture.md
