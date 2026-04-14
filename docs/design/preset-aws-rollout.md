# Preset AWS Roll-out — 추적 메타 문서

> 이 문서는 TRH Platform이 AWS 인프라 기반으로 4개 Preset(General/DeFi/Gaming/Full)을 완전 자동으로 배포·운영하기 위한 **전체 roll-out 진척 추적점**이다.
> 개별 설계 결정은 각 레포의 ADR 파일에 있다. 이 문서는 그 링크와 체크리스트 역할만 한다.

---

## Background

`docs/preset-comparison.md`는 4개 Preset과 각 Preset이 활성화하는 모듈(Bridge/Explorer/Monitoring/Uptime/CrossTrade/DRB/AA Paymaster/Backup)을 정의한다. 사용자가 Electron 앱에서 AWS SSO 로그인 + Preset 1개 선택 → 단일 클릭으로 EKS 위에 L2 + 전 모듈이 끝까지 배포되는 것이 목표다.

### 현재 상태 (2026-04-14 기준)

`trh-wiki/wiki/workflows/ec2-deploy.md`가 식별한 주요 gap:

| # | Gap | 대상 레포 | 심각도 |
|---|-----|----------|--------|
| 2 | `StackEntity.Config` JSON에 AWS creds 평문 저장 | trh-backend | 🔴 보안 |
| 3 | SSO 세션 1h TTL — 장시간 배포 중 silent fail | trh-platform | 🟠 안정성 |
| 4 | trh-sdk `NewStaticCredentialsProvider`만 지원 (session token 경로 비공식) | trh-sdk | 🟡 호환성 |
| 5 | `window.__TRH_AWS_CREDENTIALS__` — quit 후에도 미클리어 | trh-platform | 🟠 보안 |
| 7 | monitoring/blockExplorer/crossTrade AWS에서 수동 `trh install <X>` 필요 (Local은 자동) | trh-backend | 🔴 UX |
| - | SSO-first UI 없음 — access/secret 수동 입력만 노출 | trh-platform | 🟠 보안/UX |
| - | Preset별 Helm values 분기 없음 — DRB/AA Paymaster 선택적 활성화 불가 | tokamak-thanos-stack | 🔴 기능 |

---

## Roll-out 순서 (의존성 그래프)

```
tokamak-thanos-stack (ADR ①)
  └── Helm values 분기 → preset별 DRB/AA 활성화 가능
        │
        ▼
trh-sdk (ADR ②)
  └── temporary credential 공식 지원 → session token 경로 명확화
        │
        ▼
trh-backend (ADR ③ + ④)
  ├── creds 무상태화 (③) → 평문 저장 제거
  └── preset 모듈 자동 install (④) → AWS/Local 비대칭 해소
        │
        ▼
trh-platform (본 plan — Electron Electron Electron)
  ├── SSO-first UI (gap #5/UX)
  ├── SSO refresh + 만료 가드 (gap #3)
  ├── Webview creds clear (gap #5)
  ├── Region 영속화
  └── AWS preset E2E 스캐폴드
```

trh-sdk ADR ②는 trh-backend ADR ③④와 병렬로 진행 가능. tokamak-thanos-stack ADR ①은 가장 독립적이므로 즉시 착수 가능.

---

## 체크리스트

### ADR ① — Helm Values Matrix
- [ ] ADR 작성: `tokamak-thanos-stack/docs/design/preset-helm-values-matrix.md`
- [ ] ADR Accepted (리뷰 완료)
- [ ] 구현 PR: `tokamak-thanos-stack` (PR #tbd)
- [ ] `Status: Shipped`

### ADR ② — trh-sdk Temporary Credentials
- [ ] ADR 작성: `trh-sdk/docs/design/temporary-credentials.md`
- [ ] ADR Accepted
- [ ] 구현 PR: `trh-sdk` (PR #tbd)
- [ ] `Status: Shipped`

### ADR ③ — Backend Credential Storage
- [ ] ADR 작성: `trh-backend/docs/design/credential-storage.md`
- [ ] ADR Accepted
- [ ] 구현 PR: `trh-backend` (PR #tbd)
- [ ] `Status: Shipped`

### ADR ④ — Preset Module Auto-install (AWS)
- [ ] ADR 작성: `trh-backend/docs/design/preset-module-install-aws.md`
- [ ] ADR Accepted
- [ ] 구현 PR: `trh-backend` (PR #tbd)
- [ ] `Status: Shipped`

### Electron (trh-platform) 변경
- [ ] ADR ①②③④ 전부 Accepted 확인
- [ ] SSO-first UI (`src/renderer/`)
- [ ] SSO refresh + 만료 가드 (`src/main/aws-auth.ts`)
- [ ] Webview creds clear (`src/main/webview.ts`)
- [ ] Region 영속화 IPC 추가
- [ ] `tests/e2e/electron-defi-aws.live.spec.ts` 시드 스펙
- [ ] Local Docker E2E 회귀 통과 확인
- [ ] PR: `trh-platform` (PR #tbd)

---

## trh-wiki 승격 조건

각 ADR이 `Status: Shipped`가 되면 구현 PR이 동일 커밋에서:

1. `trh-wiki/wiki/workflows/ec2-deploy.md` 의 "알려진 함정 & 기술부채" 섹션에서 해당 gap 항목 제거
2. `trh-wiki/wiki/log.md`에 이관 기록 추가

Electron 변경이 완료되면:

1. `trh-wiki/wiki/components/core/trh-platform.md` 의 AWS auth 섹션 업데이트 (SSO-first 반영)
2. `trh-wiki/wiki/workflows/ec2-deploy.md` 의 Phase 1 플로우 업데이트

---

## 참고 파일

- `docs/preset-comparison.md` — Preset × 모듈 × 파라미터 정의
- `trh-wiki/wiki/workflows/ec2-deploy.md` — 전체 AWS 배포 플로우 + known gaps
- `trh-wiki/wiki/concepts/presets.md` — Preset 개념 정의
- `.claude/plans/linked-coalescing-liskov.md` — trh-platform Electron 변경 세부 plan (로컬 전용)
