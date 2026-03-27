# 로컬 Keystore + 네트워크 가드 설계

> **날짜**: 2026-03-20
> **상태**: 승인됨
> **범위**: Electron Desktop App (trh-platform)

## 문제

L2 롤업 배포 시 사용자가 역할별 EOA(Admin, Proposer, Batcher, Challenger, Sequencer) 파생을 위한 seed phrase를 입력해야 한다. 사용자는 Desktop App이 seed phrase를 외부 서버로 전송할 수 있다는 우려를 가지고 있다.

## 해결 방향

1. **로컬 Keystore** — Electron `safeStorage`를 이용해 OS 키체인으로 seed phrase를 암호화 저장. 역할별 private key는 메인 프로세스 내에서만 파생하며, 렌더러에는 절대 노출하지 않는다.
2. **네트워크 가드** — Electron 세션 레이어에서 허용된 도메인만 통과시키는 화이트리스트를 적용. 나머지 요청은 차단하고 로그로 기록한다.

## 결정 사항

| 결정 | 선택 | 근거 |
|------|------|------|
| Keystore 범위 | Seed phrase만 | AWS 자격증명 → IAM Instance Profile로 대체. DB/JWT → 로컬 컨테이너 내부 문제 |
| UI 배치 | SetupPage Step 6 (건너뛰기 가능) | 인프라 설정 완료 후, WebApp 진입 전. 흐름상 자연스러운 위치 |
| 네트워크 가드 범위 | Electron 세션 레이어 (렌더러/WebView) | Seed는 Electron에만 존재. Docker 컨테이너에는 파생된 키만 환경변수로 전달 |
| 삭제/초기화 | 트레이 메뉴에서 제공 | 사용자가 키 삭제를 명시적으로 확인할 수 있어야 신뢰도 확보 |

## 아키텍처

```
Electron 메인 프로세스
├── keystore.ts (신규)
│   ├── storeSeedPhrase(mnemonic: string): void
│   ├── hasSeedPhrase(): boolean
│   ├── deriveKeysToEnv(roles: KeyRole[]): Record<string, string>  // 메인 프로세스 내부 전용
│   ├── getAddresses(): Record<KeyRole, string>                    // 공개 주소만
│   ├── deleteSeedPhrase(): void
│   ├── validateMnemonic(mnemonic: string): boolean
│   └── isAvailable(): boolean                                     // safeStorage 지원 여부
│
├── network-guard.ts (신규)
│   ├── initNetworkGuard(session): void
│   ├── addAllowedHost(hostname: string): void  // 메인 프로세스 내부 전용
│   └── getBlockedRequests(): BlockedRequest[]
│
├── index.ts (수정)
│   ├── keystore IPC 핸들러 등록
│   ├── 앱 시작 시 네트워크 가드 초기화
│   └── 트레이 메뉴에 "Delete Stored Keys" 추가
│
└── preload.ts (수정)
    └── window.electronAPI.keystore 노출 (주소 + 저장/삭제만, private key 절대 불가)

렌더러 프로세스
├── types.ts (수정) — KeystoreAPI 인터페이스, KeyRole 타입
└── SetupPage.tsx (수정) — Step 6: L2 키 설정 (대화형, Step 5 이후 자동 진행 중단)
```

## Keystore 모듈

### 저장 경로

```
~/.config/trh-platform/keystore.enc                        (Linux)
~/Library/Application Support/trh-platform/keystore.enc    (macOS)
%APPDATA%/trh-platform/keystore.enc                        (Windows)
```

파일에는 `safeStorage.encryptString(mnemonic)` 결과가 저장된다. 파일 권한은 `0o600` (소유자만 읽기/쓰기). 동일한 앱 + 동일한 OS 사용자만 복호화 가능.

### 가용성 검사

```typescript
import { safeStorage } from 'electron';

function isAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
```

`safeStorage`를 사용할 수 없는 환경(예: gnome-keyring/kwallet이 없는 Linux)에서는 Step 6에 경고 메시지를 표시하고 Skip만 가능하게 한다: "OS keychain is not available. Seed phrase storage is disabled on this system."

### 키 파생

BIP-44 표준 경로: `m/44'/60'/0'/0/{index}`

| 인덱스 | 역할 | 용도 |
|--------|------|------|
| 0 | Admin | 컨트랙트 배포 |
| 1 | Proposer | L1에 상태 루트 제안 |
| 2 | Batcher | L1에 배치 제출 |
| 3 | Challenger | 분쟁 제출 |
| 4 | Sequencer | L2 블록 생성 |

### 생명주기

```
저장:
  사용자 입력 → validateMnemonic() → safeStorage.encryptString()
  → writeFileSync(path, data, { mode: 0o600 })

사용 (메인 프로세스 내부 전용):
  파일 읽기 → safeStorage.decryptString() → HDNodeWallet.fromPhrase(mnemonic, path)
  → 파생된 키를 Docker 컨테이너 환경변수로 주입
  → 사용 후 Buffer.fill(0)으로 제거 (최선 노력, 보안 한계 참조)

삭제:
  확인 다이얼로그 → unlinkSync(file) → 삭제 확인 → 성공 반환
  파일 손상 시: "Stored key data is corrupted" 다이얼로그 → 삭제 제안

공개 주소 (렌더러에 노출):
  동일한 파생 흐름 → 주소 문자열만 반환 (private key는 IPC를 통과하지 않음)
```

## 네트워크 가드 모듈

### 화이트리스트

```
고정 호스트:
  - localhost, 127.0.0.1             (로컬 서비스)
  - *.docker.io, *.docker.com        (Docker 이미지 Pull — 인프라 안정성을 위해 넓은 패턴)
  - github.com, api.github.com       (업데이트 확인)
  - *.githubusercontent.com

동적 호스트:
  - 사용자가 설정한 Sepolia RPC 엔드포인트
  - 메인 프로세스 내부 addAllowedHost()로만 추가 (렌더러에 노출 안 함)
```

### 구현

`session.defaultSession.webRequest.onBeforeRequest`를 사용해 렌더러 및 WebView의 모든 외부 요청을 가로챈다. 화이트리스트에 없는 호스트로의 요청은 취소하고 로그에 기록.

Docker 컨테이너 네트워크 트래픽은 필터링 대상이 아님 — 컨테이너는 자체 네트워크 네임스페이스에서 Sepolia RPC, npm registry 등에 독립적으로 접근. Seed phrase는 Docker 컨테이너에 전달되지 않으며, 파생된 private key만 환경변수로 전달.

### 신뢰 경계

네트워크 가드는 **Chromium 레이어 요청만** 커버한다 (렌더러 `fetch`, `XMLHttpRequest`, WebView 내비게이션). 다음은 커버하지 않는다:
- 메인 프로세스의 Node.js `http`/`https`/`net` 요청
- 자식 프로세스 스폰 (Docker CLI 등)

Seed phrase가 보호되는 이유:
1. 메인 프로세스 메모리에만 존재 (safeStorage에서 복호화)
2. 메인 프로세스 코드는 신뢰됨 (오픈소스, 코드 서명)
3. `ethers` 의존성은 버전 고정 및 주기적 감사 필요

### 차단 요청 로그

메모리에 저장 (영구 저장 안 함). IPC를 통해 디버깅 용도로 조회 가능:

```typescript
interface BlockedRequest {
  url: string;
  timestamp: number;
  method: string;
  source: 'renderer' | 'webview';
}
```

## SetupPage Step 6: L2 키 설정

### 자동 진행 흐름 변경

현재 `SetupPage`는 Step 1~5를 자동으로 실행하고 헬스체크 통과 후 `onComplete()`를 호출한다. Step 6 추가 시:

1. Step 1~5는 기존과 동일하게 자동 실행
2. Step 5 성공 후 **자동 진행 중단**
3. Step 6은 대화형 폼으로 렌더링 (자동화 아님)
4. 사용자가 "Save & Continue" 또는 "Skip for now"을 클릭해야 `onComplete()` 호출

### 흐름

```
Step 5: 헬스체크 ✅
    ↓ (자동 진행 여기서 중단)
Step 6: L2 Key Setup (대화형)
    ├── 검사: safeStorage.isEncryptionAvailable()?
    │   ├── 아니오 → 경고 메시지 + Skip만 가능
    │   └── 예 → 입력 폼 표시
    ├── 입력: 마스킹된 textarea (12 또는 24 단어)
    ├── 검증: 단어 수 + BIP-39 워드리스트 확인
    ├── 유효한 입력 시: 5개 역할별 주소 미리보기 표시
    │   └── 각 주소 옆에 파생 경로 표시 (m/44'/60'/0'/0/N)
    ├── [Save & Continue] → keystore에 저장 후 WebApp 이동
    └── [Skip for now] → 저장 없이 WebApp 이동
```

### UI 상태

- **사용 불가**: OS 키체인 미지원 경고 + Skip 버튼만
- **빈 상태**: 입력 필드 + 안내 텍스트
- **검증 중**: 니모닉 유효성 확인 중
- **유효**: 녹색 체크 + 주소 미리보기 테이블 (파생 경로 포함)
- **유효하지 않음**: 빨간색 에러 ("Invalid seed phrase. Must be 12 or 24 words.")
- **저장 완료**: 성공 메시지, 1초 후 자동 진행
- **오류**: keystore 쓰기 실패 메시지 + 재시도 옵션

## 트레이 메뉴 변경

```
Show Window
Open in Browser
─────────────
Restart Services
Stop Services
─────────────
Delete Stored Keys    ← 신규 (확인 다이얼로그 표시, 키 없으면 숨김)
─────────────
Quit
```

확인 다이얼로그: "This will permanently delete your stored seed phrase from this device. This action cannot be undone. Continue?"

## IPC 인터페이스

```typescript
type KeyRole = 'admin' | 'proposer' | 'batcher' | 'challenger' | 'sequencer';

// preload를 통해 렌더러에 노출 (private key 절대 불가)
interface KeystoreAPI {
  store: (mnemonic: string) => Promise<void>;
  has: () => Promise<boolean>;
  isAvailable: () => Promise<boolean>;
  getAddresses: () => Promise<Record<KeyRole, string>>;
  delete: () => Promise<void>;
  validate: (mnemonic: string) => Promise<boolean>;
}

// 렌더러에 노출 (읽기 전용)
interface NetworkGuardAPI {
  getBlockedRequests: () => Promise<BlockedRequest[]>;
}

// 메인 프로세스 내부 전용 (preload에 포함하지 않음)
// keystore.deriveKeysToEnv(roles) — Docker용 환경변수 반환
// networkGuard.addAllowedHost(hostname) — RPC 엔드포인트용
```

**핵심**: `deriveKeysToEnv()`는 IPC로 노출하지 않는다. Private key는 절대 IPC 경계를 넘지 않는다. 메인 프로세스가 내부적으로 키를 파생하고 Docker 컨테이너 환경변수에 직접 주입한다.

## 에러 처리

| 시나리오 | 동작 |
|----------|------|
| `safeStorage` 사용 불가 | Step 6에 경고 표시, Skip만 가능, keystore 기능 비활성화 |
| `keystore.enc` 파일 손상 | 에러 다이얼로그 표시, 삭제 후 재입력 제안 |
| `keystore.enc` 쓰기 실패 | Step 6에서 재시도 옵션 표시 |
| 유효하지 않은 니모닉 | UI에서 실시간 검증 에러 표시 |
| 파일 권한 거부 | OS별 안내와 함께 에러 표시 |

## 의존성

- `ethers` — BIP-44 키 파생용 HDNodeWallet, 니모닉 검증용 Mnemonic. package-lock.json에 정확한 버전 고정. 필요한 서브 임포트만 사용: `ethers/wallet`, `ethers/wordlists`.

## 보안 속성

| 속성 | 메커니즘 |
|------|----------|
| 저장 시 seed 암호화 | safeStorage → OS Keychain (macOS), DPAPI (Windows), gnome-keyring (Linux) |
| 디스크에 평문 없음 | 암호화된 blob만 저장, 파일 모드 0o600 |
| Seed가 렌더러에 도달 불가 | Private key는 IPC로 노출하지 않음 — 주소만 |
| Chromium 레이어 네트워크 가드 | session.webRequest로 화이트리스트 외 렌더러/WebView 요청 차단 |
| 사용자가 데이터 유출 확인 가능 | 소스 추적이 포함된 차단 요청 로그 |
| 사용자가 키 삭제 가능 | 트레이 메뉴 + 확인 다이얼로그 |
| 다른 앱에서 복호화 불가 | OS 키체인이 앱 ID로 범위 제한 |

### 보안 한계 (명시)

1. **네트워크 가드 범위**: Chromium 레이어 요청만 커버 (렌더러/WebView). 메인 프로세스의 Node.js 요청은 필터링하지 않음. Seed는 오픈소스 메인 프로세스 코드를 신뢰하는 것으로 보호되며, 네트워크 필터링만으로 보호되는 것이 아님.
2. **메모리 안전성**: JavaScript 문자열은 불변이며 확실하게 제로화할 수 없음. V8 GC는 즉시 수집을 보장하지 않음. 복호화된 니모닉이 힙에 일시적으로 남아있을 수 있음. 키 자료에 `Buffer`를 사용하고 사용 후 `buffer.fill(0)`으로 제거하지만, 이것은 최선 노력일 뿐 보장은 아님.
3. **공급망**: `ethers` 의존성은 메인 프로세스에서 전체 Node.js 접근 권한으로 실행됨. 반드시 버전 고정 및 주기적 감사가 필요.

## 생성할 파일

| 파일 | 설명 |
|------|------|
| `src/main/keystore.ts` | Keystore 핵심 모듈 (safeStorage + ethers HD 파생) |
| `src/main/network-guard.ts` | 네트워크 화이트리스트 필터 |

## 수정할 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/main/index.ts` | keystore IPC 핸들러 + 네트워크 가드 초기화 + 트레이 메뉴 |
| `src/main/preload.ts` | keystore (주소만) 및 networkGuard (읽기 전용) API 노출 |
| `src/renderer/types.ts` | KeystoreAPI, NetworkGuardAPI, KeyRole 인터페이스 |
| `src/renderer/pages/SetupPage.tsx` | Step 6: L2 키 설정 추가 (대화형, Step 5 이후 자동 진행 중단) |
| `package.json` | `ethers` 의존성 추가 (버전 고정) |

## 범위 외

- WebApp (trh-platform-ui)의 seed phrase 입력 모달 — 별도 리포지토리
- AWS 자격증명 관리 — IAM Instance Profile로 마이그레이션
- Docker 컨테이너 네트워크 제한 — 컨테이너는 넓은 네트워크 접근 필요
- 네트워크 가드 UI 인디케이터 (방패 아이콘) — 향후 개선
