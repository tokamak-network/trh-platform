# EIP-7702 Support Port: tokamak-thanos-geth — Research

**Researched:** 2026-03-30
**Domain:** Go-Ethereum fork — EIP-7702 (SetCodeTx) execution logic backport
**Confidence:** HIGH (all findings from direct source file inspection)

## Summary

tokamak-thanos-geth은 이미 `SetCodeTxType` (0x04) 트랜잭션 타입의 파싱/직렬화 코드(`core/types/tx_setcode.go`)를 보유하고 있다. 누락된 것은 **실행 레이어**다: `applyAuthorization()` 함수가 없고, `IntrinsicGas()` 시그니처가 auth list를 받지 않으며, txpool이 `SetCodeTxType`을 fork 게이트로 차단하지 않는다.

op-geth와의 핵심 차이는 `statedb.SetNonce()`의 시그니처다. op-geth는 `tracing.NonceChangeReason` 인수를 추가했으나 tokamak-thanos-geth에는 `core/tracing` 패키지 자체가 없다. 따라서 op-geth 코드를 그대로 복사할 수 없고, tracing 인수를 제거한 변형으로 포팅해야 한다.

Isthmus/Prague 대응 관계: op-geth에서 `PragueTime == IsthmusTime`이어야 한다는 검증 로직이 있다(`CheckOptimismValidity`). tokamak-thanos-geth에는 `IsthmusTime` 필드가 없으며 Fjord에서 포크 체인이 끝난다. EIP-7702 실행 게이트는 op-geth에서 `rules.IsPrague`로 제어된다. tokamak-thanos-geth에서 동일한 게이트를 쓰면 된다 — 별도의 `IsthmusTime` 추가가 불필요하다.

**Primary recommendation:** `applyAuthorization` + `validateAuthorization` 두 함수를 포팅하고, `IntrinsicGas` 시그니처에 authList 파라미터를 추가하며, txpool validation에 `SetCodeTxType` Prague 게이트를 추가한다. tracing 인수는 모두 제거한다.

---

## Gap Analysis: tokamak-thanos-geth vs op-geth

### 1. `params/config.go` — IsthmusTime 필드

op-geth에는 `IsthmusTime *uint64` 필드와 `IsIsthmus()`, `IsOptimismIsthmus()`, `HasOptimismWithdrawalsRoot()` 함수가 존재한다. `Rules` 구조체에도 `IsOptimismIsthmus bool`이 포함된다.

tokamak-thanos-geth에는 이 모든 것이 없다. 포크 체인이 Fjord까지만 정의되어 있다.

**판단:** EIP-7702 실행에는 IsthmusTime이 필요하지 않다. op-geth에서 실제 `applyAuthorization` 호출은 `msg.SetCodeAuthorizations != nil` 체크만으로 분기하며, `IsOptimismIsthmus` 게이트로 막지 않는다. 게이트는 `IsPrague`(txpool validation의 라인 116)에 있다. tokamak-thanos-geth에 `IsPrague`는 이미 존재한다.

### 2. `core/state_transition.go` — applyAuthorization 누락

**현재 상태 (tokamak-thanos-geth):**
- `Message` 구조체에 `SetCodeAuthorizations` 필드 없음
- `TransactionToMessage()`에서 `tx.SetCodeAuthorizations()` 호출 없음
- `IntrinsicGas()` 시그니처: `(data []byte, accessList types.AccessList, isContractCreation, isHomestead, isEIP2028, isEIP3860 bool)`
- `innerTransitionDb()`에서 authorization loop 없음
- `preCheck()`에서 `ErrSetCodeTxCreate`, `ErrEmptyAuthList` 검사 없음
- EOA 체크: `codeHash != types.EmptyCodeHash`로 단순 체크 (delegation 허용 안 함)

**op-geth 구현 (포팅 대상):**

```go
// core/state_transition.go (op-geth lines ~71, ~158, ~438-444, ~526, ~534, ~590-594, ~602-604)

// 1. IntrinsicGas 시그니처 변경 (authList 파라미터 추가)
func IntrinsicGas(data []byte, accessList types.AccessList, authList []types.SetCodeAuthorization,
    isContractCreation, isHomestead, isEIP2028, isEIP3860 bool) (uint64, error) {
    // ... 기존 로직 ...
    if authList != nil {
        gas += uint64(len(authList)) * params.CallNewAccountGas
    }
    return gas, nil
}

// 2. Message 구조체에 필드 추가
type Message struct {
    // ... 기존 필드 ...
    SetCodeAuthorizations []types.SetCodeAuthorization  // 추가
}

// 3. TransactionToMessage()에서 SetCodeAuthorizations 설정
msg := &Message{
    // ... 기존 ...
    SetCodeAuthorizations: tx.SetCodeAuthorizations(),  // 추가
}

// 4. preCheck()에 SetCodeTx 검증 추가 (blob 체크 다음에 삽입)
if msg.SetCodeAuthorizations != nil {
    if msg.To == nil {
        return fmt.Errorf("%w (sender %v)", ErrSetCodeTxCreate, msg.From)
    }
    if len(msg.SetCodeAuthorizations) == 0 {
        return fmt.Errorf("%w (sender %v)", ErrEmptyAuthList, msg.From)
    }
}

// 5. preCheck()의 EOA 체크 교체: codeHash → ParseDelegation
code := st.state.GetCode(msg.From)
_, delegated := types.ParseDelegation(code)
if len(code) > 0 && !delegated {
    return fmt.Errorf("%w: address %v, len(code): %d", ErrSenderNoEOA, msg.From.Hex(), len(code))
}

// 6. innerTransitionDb의 IntrinsicGas 호출 시그니처 업데이트
gas, err := IntrinsicGas(msg.Data, msg.AccessList, msg.SetCodeAuthorizations, contractCreation,
    rules.IsHomestead, rules.IsIstanbul, rules.IsShanghai)

// 7. innerTransitionDb의 non-create 분기에 authorization loop 추가 (SetNonce 직후)
st.state.SetNonce(msg.From, st.state.GetNonce(sender.Address())+1)
// Apply EIP-7702 authorizations.
if msg.SetCodeAuthorizations != nil {
    for _, auth := range msg.SetCodeAuthorizations {
        st.applyAuthorization(&auth)  // errors ignored per spec
    }
}
// delegation target warming
if addr, ok := types.ParseDelegation(st.state.GetCode(*msg.To)); ok {
    st.state.AddAddressToAccessList(addr)
}

// 8. 두 새 함수 추가
func (st *StateTransition) validateAuthorization(auth *types.SetCodeAuthorization) (authority common.Address, err error) {
    if !auth.ChainID.IsZero() && auth.ChainID.CmpBig(st.evm.ChainConfig().ChainID) != 0 {
        return authority, ErrAuthorizationWrongChainID
    }
    if auth.Nonce+1 < auth.Nonce {
        return authority, ErrAuthorizationNonceOverflow
    }
    authority, err = auth.Authority()
    if err != nil {
        return authority, fmt.Errorf("%w: %v", ErrAuthorizationInvalidSignature, err)
    }
    st.state.AddAddressToAccessList(authority)
    code := st.state.GetCode(authority)
    if _, ok := types.ParseDelegation(code); len(code) != 0 && !ok {
        return authority, ErrAuthorizationDestinationHasCode
    }
    if have := st.state.GetNonce(authority); have != auth.Nonce {
        return authority, ErrAuthorizationNonceMismatch
    }
    return authority, nil
}

func (st *StateTransition) applyAuthorization(auth *types.SetCodeAuthorization) error {
    authority, err := st.validateAuthorization(auth)
    if err != nil {
        return err
    }
    if st.state.Exist(authority) {
        st.state.AddRefund(params.CallNewAccountGas - params.TxAuthTupleGas)
    }
    st.state.SetNonce(authority, auth.Nonce+1)  // tracing 인수 없음 (tokamak-thanos-geth statedb 시그니처)
    if auth.Address == (common.Address{}) {
        st.state.SetCode(authority, nil)
        return nil
    }
    st.state.SetCode(authority, types.AddressToDelegation(auth.Address))
    return nil
}
```

**tracing 인수 차이 주의:**
- op-geth: `st.state.SetNonce(authority, auth.Nonce+1, tracing.NonceChangeAuthorization)`
- tokamak-thanos-geth: `st.state.SetNonce(authority, auth.Nonce+1)` — tracing 패키지 없음

### 3. `core/error.go` — EIP-7702 오류 상수 누락

tokamak-thanos-geth `core/error.go`에는 EIP-7702 관련 오류가 없다. 추가해야 할 목록:

```go
// core/error.go에 추가 (message validation errors 섹션)
ErrEmptyAuthList   = errors.New("EIP-7702 transaction with empty auth list")
ErrSetCodeTxCreate = errors.New("EIP-7702 transaction cannot be used to create contract")

// 별도 var 블록 (state transition errors - informational only)
var (
    ErrAuthorizationWrongChainID       = errors.New("EIP-7702 authorization chain ID mismatch")
    ErrAuthorizationNonceOverflow      = errors.New("EIP-7702 authorization nonce > 64 bit")
    ErrAuthorizationInvalidSignature   = errors.New("EIP-7702 authorization has invalid signature")
    ErrAuthorizationDestinationHasCode = errors.New("EIP-7702 authorization destination is a contract")
    ErrAuthorizationNonceMismatch      = errors.New("EIP-7702 authorization nonce does not match current account nonce")
)
```

### 4. `params/protocol_params.go` — TxAuthTupleGas 상수 누락

op-geth에는 `TxAuthTupleGas uint64 = 12500`이 있다. tokamak-thanos-geth에는 없다.

`applyAuthorization`의 리펀드 계산: `params.CallNewAccountGas - params.TxAuthTupleGas` = `25000 - 12500 = 12500`

```go
// params/protocol_params.go에 추가
TxAuthTupleGas uint64 = 12500  // Per auth tuple code specified in EIP-7702
```

### 5. `core/txpool/validation.go` — SetCodeTxType 게이트 누락

현재 tokamak-thanos-geth txpool/validation.go에는 SetCodeTxType에 대한 Prague 게이트가 없다. op-geth에서 포팅할 내용 (라인 116-118):

```go
// 기존 blob 체크 다음에 추가:
if !rules.IsPrague && tx.Type() == types.SetCodeTxType {
    return fmt.Errorf("%w: type %d rejected, pool not yet in Prague", core.ErrTxTypeNotSupported, tx.Type())
}
```

또한 `ValidateTransaction`의 끝부분에 SetCodeTx 빈 auth list 체크 추가:

```go
// BlobTx 체크 다음에 추가:
if tx.Type() == types.SetCodeTxType {
    if len(tx.SetCodeAuthorizations()) == 0 {
        return errors.New("set code tx must have at least one authorization tuple")
    }
}
```

txpool validation.go의 `IntrinsicGas` 호출도 시그니처 업데이트 필요:

```go
// 현재 (tokamak-thanos-geth 라인 139):
intrGas, err := core.IntrinsicGas(tx.Data(), tx.AccessList(), tx.To() == nil, ...)

// 변경 후:
intrGas, err := core.IntrinsicGas(tx.Data(), tx.AccessList(), tx.SetCodeAuthorizations(), tx.To() == nil, ...)
```

---

## Files to Change (Minimum Viable Port)

| File | Change | Approx Lines |
|------|--------|-------------|
| `params/protocol_params.go` | Add `TxAuthTupleGas = 12500` | +1 |
| `core/error.go` | Add 7 EIP-7702 error vars | +10 |
| `core/state_transition.go` | `IntrinsicGas` sig, `Message` field, `TransactionToMessage`, `preCheck` EOA+authList checks, `innerTransitionDb` authLoop, two new functions | +60 |
| `core/txpool/validation.go` | Prague gate for SetCodeTxType, empty authList check, `IntrinsicGas` call update | +10 |

**Total: ~4 files, ~81 lines added/modified**

---

## Compatibility Issues

### tracing 패키지 (HIGH SEVERITY)
op-geth는 `core/tracing` 패키지를 `SetNonce`, `SetCode`, `AddBalance` 등의 콜백 인수로 사용한다. tokamak-thanos-geth에는 이 패키지가 없다. 포팅 시 모든 tracing 인수를 제거해야 한다.

영향 받는 호출:
- `st.state.SetNonce(authority, auth.Nonce+1, tracing.NonceChangeAuthorization)` → `(authority, auth.Nonce+1)`
- `st.state.AddBalance(...)` 에도 tracing 인수가 op-geth에 있으나 이 PR 범위의 함수들에서는 해당 없음

### MaxTxGas (Osaka/EIP-7825) 체크 중복 없음
tokamak-thanos-geth `preCheck()`이 이미 `IsOsaka`로 `MaxTxGas` 체크를 하므로 해당 부분은 충돌 없음.

### Rules 구조체
tokamak-thanos-geth의 `Rules`에 `IsOptimismIsthmus`가 없지만 포팅에 필요 없다. `IsPrague`는 이미 있다.

### FloorDataGas (EIP-7623)
op-geth의 `innerExecute`에는 `rules.IsPrague`일 때 `FloorDataGas` 체크가 있다. tokamak-thanos-geth에는 이 함수가 없다. EIP-7702 최소 포트에는 불필요하지만, IsPrague 활성화 시 부작용이 있을 수 있다. 별도 이슈로 추적 권장.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Authority 서명 복구 | 직접 ecrecover 구현 | `auth.Authority()` — 이미 `tx_setcode.go`에 있음 |
| Delegation prefix 파싱 | 직접 바이트 파싱 | `types.ParseDelegation()` — 이미 있음 |
| Delegation prefix 생성 | 직접 바이트 조합 | `types.AddressToDelegation()` — 이미 있음 |

---

## Sources

### Primary (HIGH confidence — direct source inspection)
- `/Users/theo/workspace_tokamak/op-geth/core/state_transition.go` lines 71, 158, 360-444, 502-608, 714-769
- `/Users/theo/workspace_tokamak/op-geth/core/error.go` lines 127-145
- `/Users/theo/workspace_tokamak/op-geth/params/protocol_params.go` line 112
- `/Users/theo/workspace_tokamak/op-geth/params/config.go` lines 512, 896-897, 942-943, 1577
- `/Users/theo/workspace_tokamak/op-geth/core/txpool/validation.go` lines 106-118, 155-156, 163-172, 180-184
- `/Users/theo/workspace_tokamak/tokamak-thanos-geth/core/state_transition.go` — full file (621 lines)
- `/Users/theo/workspace_tokamak/tokamak-thanos-geth/core/txpool/validation.go` — full file (299 lines)
- `/Users/theo/workspace_tokamak/tokamak-thanos-geth/core/error.go` — full file (120 lines)
- `/Users/theo/workspace_tokamak/tokamak-thanos-geth/params/config.go` lines 440-490, 700-800, 1190-1234

## Metadata

**Confidence breakdown:**
- Gap analysis: HIGH — direct diff of both codebases
- Port code snippets: HIGH — copied from op-geth with tracing adaptation noted
- Compatibility issues: HIGH — verified statedb signatures in both repos

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (both repos are active; re-verify if either advances significantly)
