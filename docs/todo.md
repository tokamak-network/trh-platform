# TODO

## 2026-04-28 Desktop Update Notification Safety

- [x] Review `trh-wiki` context for `trh-platform`
- [x] Add failing tests for OS notification click routing and update warning confirmation
- [x] Implement OS desktop notification click routing to the in-app notification page
- [x] Add a user warning confirmation before Docker image pull and container restart
- [x] Run targeted unit tests, type check, and review diff
- [x] Update `docs/lessons.md` with the notification/update safety lesson

## Review

- OS desktop update notifications now focus the app and route the renderer to the in-app notification page through `app:show-notifications`.
- Docker image update execution now goes through a shared warning confirmation before image pull and container restart.
- Update IPC/action results return `boolean` so canceled updates do not hide banners or show "Updated" state.
- Targeted verification passed: `npm test -- tests/unit/update-notification-safety.test.ts`, `npm test -- tests/unit/ipc-channels.test.ts`, `npm run build:main`, `npm run build:renderer`.
- Full `npm test` still has two unrelated existing failures: `CrossTrade` label expectation mismatch and missing `ec2/main.tf`.

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

## 2026-04-18 v1.1 DRB Gaming Enablement Remediation

- [x] Reconfirm `trh-wiki` and `.planning` requirements relevant to remediation scope
- [x] Fix preset deployment path so seed phrase reaches SDK `Mnemonic`
- [x] Add or update failing tests proving mnemonic propagation is required for DRB orchestration
- [x] Wire Regular operator genesis funding into the real deployment path
- [x] Add or update failing tests proving Regular funding is written to genesis alloc
- [x] Replace skipped DRB activation/bootstrap tests with executable assertions
- [ ] Convert SDK `drb_gaming_e2e_test.go` from placeholder flow to honest executable coverage or narrow it explicitly
- [x] Make Playwright DRB deployment spec drive real UI actions instead of passive container polling
- [x] Run targeted verification for backend, sdk, and playwright changes
- [x] Update this review section with outcomes and residual risks

## Review

- backend preset deployment now carries `SeedPhrase` into both contract and local infra deployment configs, and SDK stores it as `deployConfig.Mnemonic` so DRB compose/orchestration paths can open.
- DRB regular operator genesis funding is now wired into the real contract deployment flow after DRB predeploy injection, with an executable test asserting the three regular balances are written.
- Previously skipped DRB bootstrap/activation tests now execute against seams instead of placeholders, and local DRB orchestration failure is now deployment-blocking instead of warn-only.
- Playwright DRB spec now drives the real Electron Platform UI wizard through the embedded WebContentsView and the Electron Playwright config now includes this spec.
- Residual risk: `trh-sdk/pkg/stacks/thanos/drb_gaming_e2e_test.go` is still placeholder-heavy and needs a separate pass to become real executable evidence.
- Residual risk: `go test ./pkg/services/thanos ./pkg/stacks/thanos` in `trh-backend` still fails in unrelated `funding_test.go` cases that predate this remediation.

## 2026-04-18 Codex Review Skill + Plugin Document Review

- [x] Review `trh-wiki` context for `trh-platform`
- [x] Check local `RTK.md` and active skill guidance relevant to this session
- [x] Read installed `~/.claude/skills/codex-review/SKILL.md`
- [x] Read plugin manifests in `codex-review-skills`
- [x] Compare merged no-arg flow against deleted `prep-review`
- [x] Identify accuracy, clarity, completeness, and consistency findings
- [x] Summarize review results for the user

## Review

- `skills/codex-review/SKILL.md` has a real implementation gap in direct file/dir mode: the mode explains content loading but never assigns `TYPE`, so Step 3 dispatch is underspecified.
- Prerequisite and missing-file handling are documented as "stop", but the shown shell snippets only print an error and continue; this is a behavior/document mismatch.
- The merged no-arg mode preserves the old `prep-review` context structure for the combined workflow, but it intentionally removes the old "prepare context only" checkpoint.
- `plugin.json`, `marketplace.json`, and `package.json` still describe a two-skill plugin even though only `codex-review` remains, making description drift the clearest user-facing inconsistency.
