# Lessons

## 2026-04-16

- 사용자 환경 자동화가 목적일 때는 저장소 코드보다 전역 도구 설정을 먼저 검토한다.
- "작업 종료 후" 요구는 `PostToolUse`보다 종료 시점 전용 hook이 더 정확하다.
- Codex CLI 0.121.0 hook 검증 시 `codex_hooks = true`가 필요했고, 사용자 전역 hook 파일 기본 경로는 `~/.codex/hooks.json`이었다.
- MCP 비활성화는 블록 삭제보다 주석 처리가 운영 리스크가 낮고 롤백이 빠르다.
- 컨테이너 런타임 의존 경로(예: `/root/.trh/bin`)는 배포 단계 진입 전에 `mkdir -p`로 보장하고, dependency 체크 결과에 별도 readiness 플래그로 노출해야 원인 식별이 빨라진다.

## 2026-04-18

- DRB local orchestration은 `Preset`만으로 열리지 않고 contract deploy 단계와 local infra 단계에 동일한 mnemonic이 모두 전달되어야 실제 compose data와 activation 경로가 함께 열린다.
- helper만 있는 genesis patch는 요구사항 충족이 아니다. 실제 deploy flow에 call site를 연결하고 alloc 결과를 읽는 테스트까지 붙여야 dead code를 막을 수 있다.
- placeholder `t.Skip(...)` 테스트를 남겨두면 검증 문서와 구현 사이의 단절을 가린다. 외부 의존성은 seam으로 잘라서라도 executable test로 바꾸는 편이 낫다.
- Playwright Electron spec는 파일명뿐 아니라 config의 `testMatch`에도 걸린다. spec를 추가하거나 유지할 때는 수집 규칙까지 같이 검증해야 한다.
- 여러 skill/plugin 파일을 병합할 때는 `SKILL.md` frontmatter, `plugin.json`, `marketplace.json`, `package.json` 설명 문자열을 한 번에 갱신해야 한다. 병합 후 stale description이 가장 먼저 사용자 혼란을 만든다.

## 2026-04-28

- OS desktop notification은 표시만으로 끝내지 말고 클릭 동작을 명시적으로 테스트해야 한다. Electron main helper로 분리하면 `Notification` 생성자와 click 이벤트를 단위 테스트할 수 있다.
- 컨테이너 재시작을 동반하는 업데이트 액션은 모든 진입점(tray, banner, notification action)이 같은 confirmation helper를 거쳐야 경고 누락을 막을 수 있다.
- 사용자가 위험 작업을 취소할 수 있는 IPC는 `void`보다 `boolean` 결과를 반환해야 renderer가 배너/완료 상태를 잘못 숨기지 않는다.
