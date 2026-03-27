---
status: resolved
trigger: "sdk-prebuilt-artifacts-not-applied: trh-sdk의 경량화 로직(npm pre-built artifact)이 배포에 반영되지 않음"
created: 2026-03-27T00:00:00Z
updated: 2026-03-27T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - trh-backend go.mod가 artifacts_download.go 도입 이전의 trh-sdk 커밋을 참조
test: go.mod 업데이트 + Docker 이미지 빌드 후 배포 테스트
expecting: npm artifact 다운로드 로그 출력, forge 컴파일 스킵
next_action: 사용자가 업데이트된 Docker 이미지로 배포 테스트 후 확인

## Symptoms

expected: trh-sdk가 npm에서 @tokamak-network/thanos-contracts@dev 패키지를 다운로드하여 forge-artifacts를 추출한 뒤 SKIP_FORGE_BUILD=true를 설정, forge 컴파일을 생략해야 함
actual: 배포 로그에 forge 컴파일(solc 0.6.12, 0.8.15 등)이 그대로 수행됨. npm artifact 다운로드 관련 로그 없음
errors: 명시적 에러는 없으나 경량화 로직이 완전히 무시됨
reproduction: Electron 앱에서 preset 배포 실행 시 재현
started: trh-sdk에 artifacts_download.go 커밋(90217e3)이 있으나 배포에 반영 안 됨

## Eliminated

## Evidence

- timestamp: 2026-03-27
  checked: trh-backend go.mod의 trh-sdk 버전
  found: go.mod에 v1.0.4-0.20260323125354-d1206b4ca8b6 (commit d1206b4, Mar 23) 참조
  implication: 이 커밋은 artifacts_download.go가 도입된 커밋(4452242, Mar 26)보다 3일 오래됨

- timestamp: 2026-03-27
  checked: git merge-base --is-ancestor 90217e3 d1206b4ca8b6
  found: 90217e3 is NOT ancestor of d1206b4ca8b6. d1206b4는 4452242보다 10커밋 뒤
  implication: backend Docker 이미지에 artifacts download 코드가 전혀 포함되지 않음

- timestamp: 2026-03-27
  checked: 배포 로그에서 artifact 관련 메시지
  found: "Downloading pre-built..." 메시지 없음. forge가 460+ 파일을 솔리디티 6개 버전으로 풀 컴파일
  implication: SDK 코드가 실제로 downloadPrebuiltArtifacts()를 호출하지 않음 (함수 자체가 없는 버전)

- timestamp: 2026-03-27
  checked: trh-sdk deploy_contracts.go 호출 흐름 (현재 main)
  found: downloadPrebuiltArtifacts()는 Track B goroutine에서 호출됨. 성공시 SKIP_FORGE_BUILD=true 설정. patchStartDeployScript()가 start-deploy.sh에 SKIP_FORGE_BUILD 체크 로직 주입
  implication: SDK 코드 자체는 정상. 문제는 backend가 이 코드를 포함하지 않은 것

- timestamp: 2026-03-27
  checked: 배포 로그의 submodule clone 패턴
  found: 재귀적 submodule clone 수행 (automate/lib/forge-std/lib/ds-test 등 중첩)
  implication: shallow clone 패치(Patch 6)도 미적용 - SDK 버전 불일치 추가 증거

## Resolution

root_cause: trh-backend의 go.mod가 trh-sdk v1.0.4-0.20260323125354-d1206b4ca8b6 (commit d1206b4, Mar 23)를 참조. 이 버전에는 artifacts_download.go, patchStartDeployScript의 Patch 3/4/6/8, createArtifactSymlinks 등 Mar 26 이후 추가된 경량화 코드가 전혀 포함되지 않음. 결과적으로 Docker 컨테이너 내에서 forge가 460+ 솔리디티 파일을 풀 컴파일하며, npm pre-built artifact 다운로드가 시도조차 되지 않음.
fix: trh-backend go.mod의 trh-sdk 의존성을 latest main (a1cd62f, Mar 26)으로 업데이트 + Docker 이미지 재빌드
verification: go build 성공, Docker 이미지 빌드 완료 (tokamaknetwork/trh-backend:latest, sha dcad1bd8a420). strings 검증으로 "Downloading pre-built contract artifacts from npm...", "SKIP_FORGE_BUILD" 문자열 확인. 사용자 확인 완료 (2026-03-27).
files_changed: [trh-backend/go.mod, trh-backend/go.sum]
