# TODO

## 2026-04-16 Disable NotebookLM MCP

- [x] Review `trh-wiki` context for `trh-platform`
- [x] Locate active NotebookLM MCP configuration
- [x] Confirm deactivation method with user
- [x] Comment out `mcp_servers.notebooklm` in `~/.codex/config.toml`
- [x] Re-read config to verify deactivation

## Review

- NotebookLM MCP was disabled by commenting out the server block in global Codex config.
- This preserves quick rollback by uncommenting the same lines later.

## 2026-04-16 Codex Task Completion macOS Alert

- [x] Review `trh-wiki` context for `trh-platform`
- [x] Identify whether the request belongs in repository code or Codex global configuration
- [x] Present implementation approaches and get user approval
- [x] Write design spec
- [x] Get user review on the written spec
- [x] Add `~/.codex/hooks/zed-task-complete.sh`
- [x] Register a global `Stop` hook in `~/.codex/config.toml`
- [x] Run direct verification of the hook script
- [x] Re-read config and summarize results

## Review

- 전역 Codex hook이 요구사항과 가장 직접적으로 맞는다.
- 저장소 코드 변경 없이도 모든 Codex 작업에 동일하게 적용할 수 있다.
- Codex CLI 0.121.0에서는 `codex_hooks` feature를 켜고 `~/.codex/hooks.json` 기본 경로를 사용하면 `Stop` hook가 실제로 발화한다.
