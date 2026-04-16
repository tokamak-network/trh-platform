# Lessons

## 2026-04-16

- 사용자 환경 자동화가 목적일 때는 저장소 코드보다 전역 도구 설정을 먼저 검토한다.
- "작업 종료 후" 요구는 `PostToolUse`보다 종료 시점 전용 hook이 더 정확하다.
- Codex CLI 0.121.0 hook 검증 시 `codex_hooks = true`가 필요했고, 사용자 전역 hook 파일 기본 경로는 `~/.codex/hooks.json`이었다.
- MCP 비활성화는 블록 삭제보다 주석 처리가 운영 리스크가 낮고 롤백이 빠르다.
- 컨테이너 런타임 의존 경로(예: `/root/.trh/bin`)는 배포 단계 진입 전에 `mkdir -p`로 보장하고, dependency 체크 결과에 별도 readiness 플래그로 노출해야 원인 식별이 빨라진다.
