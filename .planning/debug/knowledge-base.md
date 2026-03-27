# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## sdk-prebuilt-artifacts-not-applied -- trh-sdk npm pre-built artifact 로직이 배포에 반영되지 않음
- **Date:** 2026-03-27
- **Error patterns:** forge compile, npm artifact download missing, SKIP_FORGE_BUILD not set, go.mod outdated sdk version, solc compilation not skipped
- **Root cause:** trh-backend go.mod가 artifacts_download.go 도입 이전의 trh-sdk 커밋(d1206b4, Mar 23)을 참조. 경량화 코드가 포함되지 않은 SDK 버전으로 Docker 이미지가 빌드됨.
- **Fix:** trh-backend go.mod의 trh-sdk 의존성을 latest main (a1cd62f)으로 업데이트 + Docker 이미지 재빌드
- **Files changed:** trh-backend/go.mod, trh-backend/go.sum
---

