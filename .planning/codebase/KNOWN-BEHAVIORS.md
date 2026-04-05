# Known Behaviors — L2 Deployment & Testing

**Date:** 2026-04-05
**Source:** E2E test session 2026-04-03~05, live stack debugging

이 문서는 버그가 아닌 정상 동작이지만, 개발/테스트 시 혼동을 유발할 수 있는 항목들을 정리합니다.

---

## 1. op-node safeL2 = 0 (배포 직후)

**현상:** 배포 직후 `optimism_syncStatus`의 `unsafe_l2.number`는 > 0이지만 `safe_l2.number`는 0.

**원인:** `safe_l2`는 L1 finality 확인 후에만 진행됨. Sepolia L1 finality는 ~12분 소요.

**영향:** 배포 직후 health check에서 `safeL2 > 0` assertion이 실패할 수 있음.

**대응:** `unsafe_l2(headL2) > 0`이면 L2는 정상 동작 중. `safeL2`는 시간이 지나면 자연히 증가.

---

## 2. docker logs에서 DRB leader 로그가 비어 보임

**현상:** `docker logs <drb-leader>` 실행 시 "0 errors, 0 warnings, 0 info messages" 표시.

**원인:** rtk (token-saving hook)가 Go stdlib `log` 패키지의 출력을 인식하지 못해 모든 로그를 필터링.

**대응:**
```bash
# rtk 우회하여 실제 로그 확인
/usr/local/bin/docker logs <container>
```

---

## 3. DRB leader 포트 9600 = libp2p (HTTP 아님)

**현상:** `curl localhost:9600`이 connection refused 또는 깨진 응답 반환.

**원인:** 포트 9600은 libp2p multistream-select 프로토콜. HTTP가 아님.

**대응:**
```bash
# TCP 연결 확인 (HTTP 아님)
curl --http0.9 localhost:9600   # → /multistream/1.0.0 응답이면 정상

# 컨테이너 내부에서 확인
docker exec <drb-leader> netstat -tlnp   # → 9600 LISTEN 확인
```

---

## 4. Bridge 기본 토큰 = ETH (fee token과 무관)

**현상:** TON fee token 스택에서도 bridge deposit form이 "ETH"를 기본 표시.

**원인:** Bridge UI의 `supportedTokenList[0]`이 항상 ETH. 토큰 선택기에서 다른 토큰 선택 가능.

**영향:** 테스트에서 bridge body에 fee token 텍스트가 포함되어 있는지 확인하면 실패. Deposit form 존재 여부로 확인해야 함.

---

## 5. Bundler (alto) 기동 조건

**현상:** 배포 완료 후 bundler 컨테이너가 없거나 늦게 시작됨.

**원인:** SDK `local_network.go:198`에서 `bridgeOk == true` (L1→L2 bridge funding 성공) 일 때만 bundler 시작. Docker Compose profile `aa`로 분리되어 있음.

**대응:** bundler 테스트는 polling으로 대기 (최대 90초). bridge funding 실패 시 bundler는 시작되지 않음 (정상).

---

## 6. USDC fee = 0 (로컬 devnet)

**현상:** UserOp 실행 시 paymaster가 USDC fee를 0으로 청구.

**원인:** L2 gas price ~700 wei. 300K gas × 700 wei = 0.00021 TON. Oracle rate 0.465 USDC/TON → 0.0001 USDC → 6 decimals에서 0으로 반올림.

**영향:** 로컬 devnet에서 fee deduction assertion이 `> 0`이면 실패. `>= 0` + tx 성공 확인으로 검증.

**참고:** Sepolia testnet이나 mainnet에서는 gas price가 높아 실제 fee가 차감됨.

---

## 7. USDC bridge 경로 (L1UsdcBridge)

**현상:** `L1StandardBridge.bridgeERC20To(USDC)`로 보내면 L1에서 에스크로되지만 L2에서 mint되지 않음.

**원인:** Thanos의 L2 USDC(`FiatTokenV2_2`, 0x420...0778)는 `OptimismMintableERC20`가 아님. 전용 bridge 경로 사용:
```
L1UsdcBridge.bridgeERC20To()
  → CrossDomainMessenger
  → L2UsdcBridge.finalizeDeposit()
  → MasterMinter.mint()
  → FiatTokenV2_2 (L2 USDC)
```

**대응:** USDC deposit 시 `L1UsdcBridgeProxy` 주소 사용 (deployment JSON에서 조회).

**주의:** L1StandardBridge로 보낸 USDC는 에스크로에 잠기며 회수 방법이 제한적.

---

## 8. Paymaster fee token = BridgedUSDC (0x420...0778)

**현상:** paymaster-smoke.spec.ts에서 `WUSDC_ADDRESS = 0x420...006`으로 명명했지만 실제로는 WTON.

**실제 매핑:**

| 주소 | 실제 이름 | Decimals | Paymaster 등록 |
|------|----------|----------|---------------|
| `0x420...0006` | **Wrapped TON (WTON)** | 18 | ❌ 미등록 |
| `0x420...0778` | **Bridged USDC** | 6 | ✅ 등록 (markup 3%) |

**대응:** paymaster UserOp의 `paymasterAndData`에 fee token으로 `0x420...0778` (BridgedUSDC)를 인코딩해야 함. WTON을 사용하면 AA23 (paymaster validation revert) 발생.

---

*Updated: 2026-04-05*
