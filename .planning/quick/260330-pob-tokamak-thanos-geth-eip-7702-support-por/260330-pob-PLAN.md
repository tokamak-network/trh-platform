---
phase: quick
plan: 260330-pob
type: execute
wave: 1
depends_on: []
files_modified:
  - /Users/theo/workspace_tokamak/tokamak-thanos-geth/params/protocol_params.go
  - /Users/theo/workspace_tokamak/tokamak-thanos-geth/core/error.go
  - /Users/theo/workspace_tokamak/tokamak-thanos-geth/core/state_transition.go
  - /Users/theo/workspace_tokamak/tokamak-thanos-geth/core/txpool/validation.go
autonomous: true
requirements: [EIP-7702-PORT]

must_haves:
  truths:
    - "SetCodeTx(type 0x04)가 IsPrague 활성화 체인에서 실행됨 (revert 없음)"
    - "authorization list의 각 항목이 validateAuthorization + applyAuthorization을 거쳐 EOA delegation 코드 설정"
    - "IsPrague 미활성화 체인에서 SetCodeTxType txpool에 거부됨"
    - "빈 auth list를 가진 SetCodeTx가 preCheck/txpool에서 거부됨"
    - "go build ./core/... 성공 (컴파일 에러 없음)"
  artifacts:
    - path: "/Users/theo/workspace_tokamak/tokamak-thanos-geth/params/protocol_params.go"
      provides: "TxAuthTupleGas = 12500 상수"
      contains: "TxAuthTupleGas"
    - path: "/Users/theo/workspace_tokamak/tokamak-thanos-geth/core/error.go"
      provides: "EIP-7702 에러 상수 7종"
      contains: "ErrEmptyAuthList"
    - path: "/Users/theo/workspace_tokamak/tokamak-thanos-geth/core/state_transition.go"
      provides: "validateAuthorization + applyAuthorization + Message.SetCodeAuthorizations + IntrinsicGas authList 지원"
      exports: ["validateAuthorization", "applyAuthorization", "IntrinsicGas"]
    - path: "/Users/theo/workspace_tokamak/tokamak-thanos-geth/core/txpool/validation.go"
      provides: "Prague gate + empty auth list check + IntrinsicGas 시그니처 업데이트"
  key_links:
    - from: "core/state_transition.go (innerTransitionDb non-create branch)"
      to: "applyAuthorization loop"
      via: "msg.SetCodeAuthorizations != nil 체크"
      pattern: "SetCodeAuthorizations"
    - from: "core/txpool/validation.go"
      to: "core.IntrinsicGas"
      via: "SetCodeAuthorizations() 인수 추가"
      pattern: "tx.SetCodeAuthorizations()"
---

<objective>
tokamak-thanos-geth에 EIP-7702 SetCodeTx 실행 로직을 op-geth에서 포팅.

Purpose: SetCodeTxType(0x04) 파싱/직렬화는 이미 있으나 실행 레이어(validateAuthorization, applyAuthorization)가 누락돼 있음. Prague 포크 활성화 시 트랜잭션이 noop으로 통과되는 버그 수정.
Output: 4개 파일 수정, `go build ./core/...` 성공, EIP-7702 실행 경로 완성.
</objective>

<context>
<!-- tokamak-thanos-geth 경로: /Users/theo/workspace_tokamak/tokamak-thanos-geth -->

<!-- op-geth 포팅 소스: /Users/theo/workspace_tokamak/op-geth/core/state_transition.go -->

<interfaces>
<!-- 현재 tokamak-thanos-geth 시그니처 (변경 전) -->

core/state_transition.go line 70:
```go
func IntrinsicGas(data []byte, accessList types.AccessList, isContractCreation bool, isHomestead, isEIP2028, isEIP3860 bool) (uint64, error)
```

core/state_transition.go line 130-153:
```go
type Message struct {
    To            *common.Address
    From          common.Address
    Nonce         uint64
    Value         *big.Int
    GasLimit      uint64
    GasPrice      *big.Int
    GasFeeCap     *big.Int
    GasTipCap     *big.Int
    Data          []byte
    AccessList    types.AccessList
    BlobGasFeeCap *big.Int
    BlobHashes    []common.Hash
    SkipAccountChecks bool
    IsSystemTx     bool
    IsDepositTx    bool
    Mint           *big.Int
    RollupCostData types.RollupCostData
    // SetCodeAuthorizations 필드 없음 — 추가 필요
}
```

core/state_transition.go line 330-334 (preCheck EOA check):
```go
codeHash := st.state.GetCodeHash(msg.From)
if codeHash != (common.Hash{}) && codeHash != types.EmptyCodeHash {
    return fmt.Errorf("%w: address %v, codehash: %s", ErrSenderNoEOA,
        msg.From.Hex(), codeHash)
}
```

core/state_transition.go line 476 (IntrinsicGas 호출):
```go
gas, err := IntrinsicGas(msg.Data, msg.AccessList, contractCreation, rules.IsHomestead, rules.IsIstanbul, rules.IsShanghai)
```

core/state_transition.go line 511-513 (non-create branch):
```go
st.state.SetNonce(msg.From, st.state.GetNonce(sender.Address())+1)
ret, st.gasRemaining, vmerr = st.evm.Call(sender, st.to(), msg.Data, st.gasRemaining, value)
```

core/txpool/validation.go line 102-104 (Cancun gate — Prague gate 삽입 위치 바로 아래):
```go
if !opts.Config.IsCancun(head.Number, head.Time) && tx.Type() == types.BlobTxType {
    return fmt.Errorf("%w: type %d rejected, pool not yet in Cancun", core.ErrTxTypeNotSupported, tx.Type())
}
```

core/txpool/validation.go line 139 (IntrinsicGas 호출):
```go
intrGas, err := core.IntrinsicGas(tx.Data(), tx.AccessList(), tx.To() == nil, true, opts.Config.IsIstanbul(head.Number), opts.Config.IsShanghai(head.Number, head.Time))
```

<!-- statedb.SetNonce 시그니처 — tracing 인수 없음 -->
<!-- st.state.SetNonce(addr, nonce) — 2개 인수만 사용 -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: error.go 에러 추가 + state_transition.go EIP-7702 실행 로직 포팅</name>
  <files>
    /Users/theo/workspace_tokamak/tokamak-thanos-geth/params/protocol_params.go
    /Users/theo/workspace_tokamak/tokamak-thanos-geth/core/error.go
    /Users/theo/workspace_tokamak/tokamak-thanos-geth/core/state_transition.go
  </files>
  <action>
**Step 1: params/protocol_params.go에 TxAuthTupleGas 추가**

`TxBlobTxMinBlobGasPrice` 또는 관련 Cancun/Prague 상수 근처에 추가:
```go
TxAuthTupleGas uint64 = 12500 // Per auth tuple code specified in EIP-7702
```

**Step 2: core/error.go에 EIP-7702 에러 상수 추가**

기존 `ErrBlobTxCreate` 아래, `ErrSystemTxNotSupported` 위에 추가:
```go
// ErrEmptyAuthList is returned if a set code transaction has no authorizations.
ErrEmptyAuthList = errors.New("EIP-7702 transaction with empty auth list")

// ErrSetCodeTxCreate is returned if a set code transaction targets contract creation.
ErrSetCodeTxCreate = errors.New("EIP-7702 transaction cannot be used to create contract")
```

파일 맨 아래 별도 var 블록으로 추가 (informational only — state transition errors):
```go
// EIP-7702 authorization errors (informational, do not abort block processing)
var (
    ErrAuthorizationWrongChainID       = errors.New("EIP-7702 authorization chain ID mismatch")
    ErrAuthorizationNonceOverflow      = errors.New("EIP-7702 authorization nonce > 64 bit")
    ErrAuthorizationInvalidSignature   = errors.New("EIP-7702 authorization has invalid signature")
    ErrAuthorizationDestinationHasCode = errors.New("EIP-7702 authorization destination is a contract")
    ErrAuthorizationNonceMismatch      = errors.New("EIP-7702 authorization nonce does not match current account nonce")
)
```

**Step 3: core/state_transition.go 변경 (5곳)**

3-a. `IntrinsicGas` 시그니처 변경 — authList 파라미터 추가 및 가스 계산:
```go
func IntrinsicGas(data []byte, accessList types.AccessList, authList []types.SetCodeAuthorization,
    isContractCreation bool, isHomestead, isEIP2028, isEIP3860 bool) (uint64, error) {
    // ... 기존 로직 동일 ...
    if authList != nil {
        gas += uint64(len(authList)) * params.CallNewAccountGas
    }
    return gas, nil
}
```

3-b. `Message` 구조체에 필드 추가 — `BlobHashes` 아래에:
```go
SetCodeAuthorizations []types.SetCodeAuthorization
```

3-c. `TransactionToMessage()` 에서 필드 설정 — `BlobGasFeeCap` 설정 줄 아래에:
```go
SetCodeAuthorizations: tx.SetCodeAuthorizations(),
```

3-d. `preCheck()` 에서 두 가지 수정:

(i) EOA 체크 교체 — 현재 codeHash 기반 체크를 `ParseDelegation` 기반으로 교체:
```go
// 기존 codeHash 체크 삭제하고 아래로 교체:
code := st.state.GetCode(msg.From)
_, delegated := types.ParseDelegation(code)
if len(code) > 0 && !delegated {
    return fmt.Errorf("%w: address %v, len(code): %d", ErrSenderNoEOA, msg.From.Hex(), len(code))
}
```

(ii) SetCodeTx 검증 추가 — blob 체크 (`msg.BlobHashes != nil`) 블록 바로 위에 삽입:
```go
// SetCodeTx validation (EIP-7702)
if msg.SetCodeAuthorizations != nil {
    if msg.To == nil {
        return fmt.Errorf("%w (sender %v)", ErrSetCodeTxCreate, msg.From)
    }
    if len(msg.SetCodeAuthorizations) == 0 {
        return fmt.Errorf("%w (sender %v)", ErrEmptyAuthList, msg.From)
    }
}
```

3-e. `innerTransitionDb()` 에서 두 가지 수정:

(i) `IntrinsicGas` 호출 시그니처 업데이트:
```go
gas, err := IntrinsicGas(msg.Data, msg.AccessList, msg.SetCodeAuthorizations, contractCreation, rules.IsHomestead, rules.IsIstanbul, rules.IsShanghai)
```

(ii) non-create 분기에 authorization loop 추가 — `st.state.SetNonce(msg.From, ...)` 다음 줄, `evm.Call` 호출 전에:
```go
// Apply EIP-7702 authorizations (errors are informational per spec, not block-aborting)
if msg.SetCodeAuthorizations != nil {
    for _, auth := range msg.SetCodeAuthorizations {
        st.applyAuthorization(&auth)
    }
}
// Warm delegation target if sender has delegation code
if addr, ok := types.ParseDelegation(st.state.GetCode(*msg.To)); ok {
    st.state.AddAddressToAccessList(addr)
}
```

**Step 4: validateAuthorization + applyAuthorization 추가**

`refundGas` 함수 바로 위에 두 함수 추가:
```go
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
    st.state.SetNonce(authority, auth.Nonce+1)
    if auth.Address == (common.Address{}) {
        st.state.SetCode(authority, nil)
        return nil
    }
    st.state.SetCode(authority, types.AddressToDelegation(auth.Address))
    return nil
}
```

주의사항:
- `st.state.SetNonce(authority, auth.Nonce+1)` — tracing 인수 없음 (tokamak-thanos-geth statedb 시그니처는 2개 인수)
- `auth.ChainID.IsZero()` 는 uint256.Int 메서드; `auth.ChainID.CmpBig(...)` 는 uint256.Int.CmpBig() 사용
- `auth.Authority()` 는 이미 `core/types/tx_setcode.go`에 구현되어 있음
  </action>
  <verify>
    <automated>cd /Users/theo/workspace_tokamak/tokamak-thanos-geth && go build ./core/... 2>&1</automated>
  </verify>
  <done>
    - `go build ./core/...` 성공 (출력 없음)
    - `grep -n "SetCodeAuthorizations" core/state_transition.go` 가 Message 필드, TransactionToMessage, preCheck, innerTransitionDb 총 4곳 이상 출력
    - `grep -n "applyAuthorization\|validateAuthorization" core/state_transition.go` 가 함수 정의 2개 + 호출 포함해 출력
  </done>
</task>

<task type="auto">
  <name>Task 2: txpool/validation.go Prague gate + empty auth list + IntrinsicGas 시그니처 업데이트</name>
  <files>
    /Users/theo/workspace_tokamak/tokamak-thanos-geth/core/txpool/validation.go
  </files>
  <action>
**Step 1: Prague gate 추가 — Cancun gate 바로 아래 (line 102-104 이후)에 삽입**

```go
if !opts.Config.IsPrague(head.Number, head.Time) && tx.Type() == types.SetCodeTxType {
    return fmt.Errorf("%w: type %d rejected, pool not yet in Prague", core.ErrTxTypeNotSupported, tx.Type())
}
```

**Step 2: IntrinsicGas 호출 시그니처 업데이트 (line 139)**

현재:
```go
intrGas, err := core.IntrinsicGas(tx.Data(), tx.AccessList(), tx.To() == nil, true, opts.Config.IsIstanbul(head.Number), opts.Config.IsShanghai(head.Number, head.Time))
```

변경 후:
```go
intrGas, err := core.IntrinsicGas(tx.Data(), tx.AccessList(), tx.SetCodeAuthorizations(), tx.To() == nil, true, opts.Config.IsIstanbul(head.Number), opts.Config.IsShanghai(head.Number, head.Time))
```

**Step 3: SetCodeTx empty auth list 체크 추가 — BlobTxType 체크 블록 (`if tx.Type() == types.BlobTxType { ... }`) 바로 아래, `return nil` 바로 위에:**

```go
if tx.Type() == types.SetCodeTxType {
    if len(tx.SetCodeAuthorizations()) == 0 {
        return errors.New("set code tx must have at least one authorization tuple")
    }
}
```

이 블록에 `errors` 패키지가 이미 import되어 있는지 확인. 없으면 import 추가.

주의사항:
- `tx.SetCodeAuthorizations()` 는 `*types.Transaction`의 메서드로 이미 `core/types/tx_setcode.go`에 있음
- `types.SetCodeTxType` 상수도 이미 정의됨
- `opts.Config.IsPrague(head.Number, head.Time)` — 이미 Prague 게이트가 codebase에 존재함을 리서치에서 확인
  </action>
  <verify>
    <automated>cd /Users/theo/workspace_tokamak/tokamak-thanos-geth && go build ./core/... 2>&1</automated>
  </verify>
  <done>
    - `go build ./core/...` 성공 (출력 없음)
    - `grep -n "SetCodeTxType\|SetCodeAuthorizations\|IsPrague" core/txpool/validation.go` 가 세 곳 모두 출력
    - Task 1 + Task 2 통합 빌드 성공 확인
  </done>
</task>

</tasks>

<verification>
두 Task 완료 후 최종 검증:

```bash
cd /Users/theo/workspace_tokamak/tokamak-thanos-geth

# 전체 빌드
go build ./...

# 핵심 심볼 존재 확인
grep -n "TxAuthTupleGas" params/protocol_params.go
grep -n "ErrEmptyAuthList\|ErrSetCodeTxCreate\|ErrAuthorizationWrongChainID" core/error.go
grep -n "SetCodeAuthorizations\|applyAuthorization\|validateAuthorization" core/state_transition.go
grep -n "IsPrague.*SetCodeTxType\|SetCodeAuthorizations" core/txpool/validation.go
```
</verification>

<success_criteria>
- `go build ./...` 이 tokamak-thanos-geth에서 에러 없이 완료
- core/error.go에 EIP-7702 에러 상수 7개 모두 존재
- params/protocol_params.go에 TxAuthTupleGas = 12500 존재
- core/state_transition.go에 validateAuthorization + applyAuthorization 함수 정의 존재
- core/state_transition.go Message 구조체에 SetCodeAuthorizations 필드 존재
- core/txpool/validation.go에 Prague gate + empty auth list 체크 존재
- IntrinsicGas 시그니처가 두 호출처(state_transition.go, txpool/validation.go) 모두에서 authList 파라미터 포함해 일치
</success_criteria>

<output>
완료 후 별도 SUMMARY.md 불필요 (quick task). 빌드 성공 결과를 사용자에게 직접 보고.
</output>
