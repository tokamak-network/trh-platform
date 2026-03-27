# 로컬 Keystore + 네트워크 가드 구현 계획

> **에이전트용:** 필수 서브스킬: superpowers:subagent-driven-development (권장) 또는 superpowers:executing-plans를 사용하여 태스크별로 구현. 체크박스(`- [ ]`) 구문으로 진행 추적.

**목표:** Electron Desktop App에 seed phrase 암호화 저장(OS Keychain) + 네트워크 화이트리스트를 추가하여, 민감 정보가 외부로 유출되지 않음을 기술적으로 보장한다.

**아키텍처:** `safeStorage`로 seed phrase를 OS Keychain에 암호화 저장. 키 파생(BIP-44)은 메인 프로세스 내부에서만 수행하며, 렌더러에는 공개 주소만 노출. `session.webRequest`로 Chromium 레이어의 외부 요청을 화이트리스트로 제한.

**기술 스택:** Electron 33 `safeStorage`, `ethers` (HDNodeWallet, Mnemonic), TypeScript, React 19

**스펙 문서:** `docs/superpowers/specs/2026-03-20-local-keystore-network-guard-design.md`

---

## 파일 구조

### 신규 생성

| 파일 | 역할 |
|------|------|
| `src/main/keystore.ts` | Keystore 핵심 모듈 — safeStorage 암호화, BIP-44 키 파생, 니모닉 검증 |
| `src/main/network-guard.ts` | 네트워크 화이트리스트 — session.webRequest 필터, 차단 로그 |

### 수정

| 파일 | 변경 |
|------|------|
| `package.json` | `ethers` 의존성 추가 |
| `src/renderer/types.ts` | `KeyRole`, `KeystoreAPI`, `NetworkGuardAPI`, `BlockedRequest` 타입 추가 |
| `src/main/preload.ts` | `keystore`, `networkGuard` IPC 브릿지 추가 |
| `src/main/index.ts` | keystore/network-guard IPC 핸들러 등록, 트레이 메뉴 변경 |
| `src/renderer/pages/SetupPage.tsx` | Step 6 (L2 Key Setup) 추가, 자동 진행 중단 로직 |
| `src/renderer/pages/SetupPage.css` | Step 6 UI 스타일 |
| `src/renderer/mock/electronAPI.ts` | keystore/networkGuard mock 추가 |

---

## Task 1: ethers 의존성 설치

**파일:**
- 수정: `package.json`

- [ ] **Step 1: ethers 설치**

```bash
npm install ethers@6.13.4
```

- [ ] **Step 2: 설치 확인**

```bash
node -e "const { HDNodeWallet, Mnemonic } = require('ethers'); console.log('ethers OK')"
```

예상: `ethers OK` 출력

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json
git commit -m "feat: add ethers dependency for HD wallet key derivation"
```

---

## Task 2: 타입 정의 추가

**파일:**
- 수정: `src/renderer/types.ts`

- [ ] **Step 1: KeyRole, KeystoreAPI, NetworkGuardAPI 타입 추가**

`types.ts` 파일 끝(`declare global` 전)에 다음을 추가:

```typescript
export type KeyRole = 'admin' | 'proposer' | 'batcher' | 'challenger' | 'sequencer';

export interface KeystoreAPI {
  store: (mnemonic: string) => Promise<void>;
  has: () => Promise<boolean>;
  isAvailable: () => Promise<boolean>;
  getAddresses: () => Promise<Record<KeyRole, string>>;
  previewAddresses: (mnemonic: string) => Promise<Record<KeyRole, string>>;
  delete: () => Promise<void>;
  validate: (mnemonic: string) => Promise<boolean>;
}

export interface BlockedRequest {
  url: string;
  timestamp: number;
  method: string;
  source: 'renderer' | 'webview';
}

export interface NetworkGuardAPI {
  getBlockedRequests: () => Promise<BlockedRequest[]>;
}
```

`ElectronAPI` 인터페이스에 다음 2개 필드 추가:

```typescript
export interface ElectronAPI {
  // ... 기존 docker, app, webview, notifications 유지 ...
  keystore: KeystoreAPI;
  networkGuard: NetworkGuardAPI;
}
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc -p tsconfig.renderer.json --noEmit
```

예상: 에러 발생 (preload에서 keystore/networkGuard 미구현). 이 단계에서는 types.ts 자체만 통과하면 됨.

- [ ] **Step 3: 커밋**

```bash
git add src/renderer/types.ts
git commit -m "feat: add KeystoreAPI and NetworkGuardAPI type definitions"
```

---

## Task 3: Keystore 모듈 구현

**파일:**
- 생성: `src/main/keystore.ts`

- [ ] **Step 1: keystore.ts 파일 생성**

```typescript
import { safeStorage, app } from 'electron';
import { HDNodeWallet, Mnemonic } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

export type KeyRole = 'admin' | 'proposer' | 'batcher' | 'challenger' | 'sequencer';

const ROLE_INDICES: Record<KeyRole, number> = {
  admin: 0,
  proposer: 1,
  batcher: 2,
  challenger: 3,
  sequencer: 4,
};

const ALL_ROLES: KeyRole[] = ['admin', 'proposer', 'batcher', 'challenger', 'sequencer'];

const KEYSTORE_FILENAME = 'keystore.enc';

function getKeystorePath(): string {
  return path.join(app.getPath('userData'), KEYSTORE_FILENAME);
}

export function isAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function hasSeedPhrase(): boolean {
  return fs.existsSync(getKeystorePath());
}

export function validateMnemonic(mnemonic: string): boolean {
  try {
    const trimmed = mnemonic.trim().toLowerCase();
    const words = trimmed.split(/\s+/);
    if (words.length !== 12 && words.length !== 24) return false;
    Mnemonic.fromPhrase(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function storeSeedPhrase(mnemonic: string): void {
  if (!isAvailable()) {
    throw new Error('OS keychain encryption is not available');
  }

  const trimmed = mnemonic.trim().toLowerCase();
  if (!validateMnemonic(trimmed)) {
    throw new Error('Invalid mnemonic phrase');
  }

  const encrypted = safeStorage.encryptString(trimmed);
  const keystorePath = getKeystorePath();
  const dir = path.dirname(keystorePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(keystorePath, encrypted, { mode: 0o600 });
}

function decryptSeedPhrase(): string {
  const keystorePath = getKeystorePath();
  if (!fs.existsSync(keystorePath)) {
    throw new Error('No seed phrase stored');
  }

  try {
    const encrypted = fs.readFileSync(keystorePath);
    return safeStorage.decryptString(encrypted);
  } catch (err) {
    throw new Error('Stored key data is corrupted. Please delete and re-enter your seed phrase.');
  }
}

function deriveWallet(mnemonic: string, role: KeyRole): HDNodeWallet {
  const index = ROLE_INDICES[role];
  return HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`);
}

export function getAddresses(): Record<KeyRole, string> {
  const mnemonic = decryptSeedPhrase();
  const addresses: Record<string, string> = {};

  for (const role of ALL_ROLES) {
    const wallet = deriveWallet(mnemonic, role);
    addresses[role] = wallet.address;
  }

  return addresses as Record<KeyRole, string>;
}

/**
 * Preview addresses from a mnemonic WITHOUT storing it.
 * Used for UI preview before user confirms save.
 */
export function previewAddresses(mnemonic: string): Record<KeyRole, string> {
  const trimmed = mnemonic.trim().toLowerCase();
  if (!validateMnemonic(trimmed)) {
    throw new Error('Invalid mnemonic phrase');
  }

  const addresses: Record<string, string> = {};
  for (const role of ALL_ROLES) {
    const wallet = deriveWallet(trimmed, role);
    addresses[role] = wallet.address;
  }

  return addresses as Record<KeyRole, string>;
}

/**
 * Main-process internal only. NOT exposed via IPC.
 * Derives private keys and returns as env var map for Docker containers.
 * Best-effort memory zeroing after use.
 */
export function deriveKeysToEnv(roles: KeyRole[]): Record<string, string> {
  const mnemonic = decryptSeedPhrase();
  const env: Record<string, string> = {};

  try {
    for (const role of roles) {
      const wallet = deriveWallet(mnemonic, role);
      const envKey = `${role.toUpperCase()}_PRIVATE_KEY`;
      env[envKey] = wallet.privateKey;
    }
  } finally {
    // Best-effort memory zeroing (see spec: Security Limitations #2)
    const buf = Buffer.from(mnemonic);
    buf.fill(0);
  }

  return env;
}

export function deleteSeedPhrase(): void {
  const keystorePath = getKeystorePath();
  if (fs.existsSync(keystorePath)) {
    fs.unlinkSync(keystorePath);
  }

  // Verify deletion
  if (fs.existsSync(keystorePath)) {
    throw new Error('Failed to delete keystore file');
  }
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc -p tsconfig.electron.json --noEmit
```

예상: 통과

- [ ] **Step 3: 커밋**

```bash
git add src/main/keystore.ts
git commit -m "feat: implement keystore module with safeStorage encryption and BIP-44 derivation"
```

---

## Task 4: 네트워크 가드 모듈 구현

**파일:**
- 생성: `src/main/network-guard.ts`

- [ ] **Step 1: network-guard.ts 파일 생성**

```typescript
import type { Session } from 'electron';

export interface BlockedRequest {
  url: string;
  timestamp: number;
  method: string;
  source: 'renderer' | 'webview';
}

const STATIC_ALLOWED: string[] = [
  'localhost',
  '127.0.0.1',
];

const STATIC_PATTERNS: RegExp[] = [
  /\.docker\.io$/,
  /\.docker\.com$/,
  /^github\.com$/,
  /^api\.github\.com$/,
  /\.githubusercontent\.com$/,
];

const dynamicHosts = new Set<string>();
const blockedRequests: BlockedRequest[] = [];
const MAX_BLOCKED_LOG = 100;
let mainWindowWebContentsId: number | null = null;

function isAllowed(hostname: string): boolean {
  if (STATIC_ALLOWED.includes(hostname)) return true;
  if (dynamicHosts.has(hostname)) return true;
  return STATIC_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function addAllowedHost(hostname: string): void {
  dynamicHosts.add(hostname);
}

export function getBlockedRequests(): BlockedRequest[] {
  return [...blockedRequests];
}

export function setMainWindowId(id: number): void {
  mainWindowWebContentsId = id;
}

export function initNetworkGuard(session: Session): void {
  session.webRequest.onBeforeRequest((details, callback) => {
    // Allow data: and file: URLs
    if (details.url.startsWith('data:') || details.url.startsWith('file:')) {
      callback({});
      return;
    }

    // Allow devtools
    if (details.url.startsWith('devtools:') || details.url.startsWith('chrome-extension:')) {
      callback({});
      return;
    }

    try {
      const url = new URL(details.url);

      if (isAllowed(url.hostname)) {
        callback({});
        return;
      }

      // Block and log
      const blocked: BlockedRequest = {
        url: details.url,
        timestamp: Date.now(),
        method: details.method || 'GET',
        source: (mainWindowWebContentsId !== null && details.webContentsId === mainWindowWebContentsId)
          ? 'renderer' : 'webview',
      };

      blockedRequests.push(blocked);
      if (blockedRequests.length > MAX_BLOCKED_LOG) {
        blockedRequests.shift();
      }

      console.warn(`[NetworkGuard] BLOCKED: ${details.method} ${url.hostname}${url.pathname}`);
      callback({ cancel: true });
    } catch {
      // Invalid URL — allow (likely internal)
      callback({});
    }
  });

  console.log('[NetworkGuard] Initialized with whitelist');
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc -p tsconfig.electron.json --noEmit
```

예상: 통과

- [ ] **Step 3: 커밋**

```bash
git add src/main/network-guard.ts
git commit -m "feat: implement network guard with domain whitelist and blocked request logging"
```

---

## Task 5: Preload에 keystore/networkGuard IPC 브릿지 추가

**파일:**
- 수정: `src/main/preload.ts`

- [ ] **Step 1: preload.ts에 keystore 객체 추가**

`electronAPI` 객체 안에 (`webview` 블록 뒤, 닫는 `}` 전) 다음을 추가:

```typescript
  keystore: {
    store: (mnemonic: string): Promise<void> => ipcRenderer.invoke('keystore:store', mnemonic),
    has: (): Promise<boolean> => ipcRenderer.invoke('keystore:has'),
    isAvailable: (): Promise<boolean> => ipcRenderer.invoke('keystore:is-available'),
    getAddresses: (): Promise<Record<string, string>> => ipcRenderer.invoke('keystore:get-addresses'),
    previewAddresses: (mnemonic: string): Promise<Record<string, string>> => ipcRenderer.invoke('keystore:preview-addresses', mnemonic),
    delete: (): Promise<void> => ipcRenderer.invoke('keystore:delete'),
    validate: (mnemonic: string): Promise<boolean> => ipcRenderer.invoke('keystore:validate', mnemonic),
  },

  networkGuard: {
    getBlockedRequests: (): Promise<Array<{ url: string; timestamp: number; method: string; source: string }>> =>
      ipcRenderer.invoke('network-guard:get-blocked'),
  },
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc -p tsconfig.electron.json --noEmit
```

예상: 통과

- [ ] **Step 3: 커밋**

```bash
git add src/main/preload.ts
git commit -m "feat: expose keystore and networkGuard IPC bridge in preload"
```

---

## Task 6: index.ts에 IPC 핸들러 + 네트워크 가드 초기화 + 트레이 메뉴

**파일:**
- 수정: `src/main/index.ts`

- [ ] **Step 1: import 추가**

파일 상단 import 블록에 추가:

```typescript
import {
  isAvailable as keystoreIsAvailable,
  hasSeedPhrase,
  storeSeedPhrase,
  getAddresses,
  deleteSeedPhrase,
  validateMnemonic,
} from './keystore';
import {
  initNetworkGuard,
  setMainWindowId,
  getBlockedRequests,
  addAllowedHost,
} from './network-guard';
```

`electron` import에 `session` 추가:

```typescript
import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, NativeImage, dialog, Notification, session } from 'electron';
```

- [ ] **Step 2: setupIpcHandlers()에 keystore + network-guard 핸들러 추가**

`setupIpcHandlers()` 함수 끝 (`registerWebviewIpcHandlers` 호출 전)에 추가:

```typescript
  // Keystore IPC handlers
  ipcMain.handle('keystore:store', async (_event, mnemonic: string) => {
    storeSeedPhrase(mnemonic);
  });
  ipcMain.handle('keystore:has', () => hasSeedPhrase());
  ipcMain.handle('keystore:is-available', () => keystoreIsAvailable());
  ipcMain.handle('keystore:get-addresses', () => getAddresses());
  ipcMain.handle('keystore:delete', () => deleteSeedPhrase());
  ipcMain.handle('keystore:validate', (_event, mnemonic: string) => validateMnemonic(mnemonic));
  ipcMain.handle('keystore:preview-addresses', (_event, mnemonic: string) => {
    const { previewAddresses } = require('./keystore');
    return previewAddresses(mnemonic);
  });

  // Network Guard IPC handlers
  ipcMain.handle('network-guard:get-blocked', () => getBlockedRequests());
```

- [ ] **Step 3: app.whenReady()에 네트워크 가드 초기화 추가**

`setupIpcHandlers();` 호출 직후, `createWindow();` 호출 직전에 추가:

```typescript
  initNetworkGuard(session.defaultSession);
```

`createWindow();` 호출 직후에 추가 (mainWindow가 생성된 후):

```typescript
  if (mainWindow) {
    setMainWindowId(mainWindow.webContents.id);
  }
```

- [ ] **Step 4: buildTrayMenu()에 "Delete Stored Keys" 항목 추가**

`{ type: 'separator' }` + `Quit` 항목 바로 위에 추가:

```typescript
    // Delete Stored Keys — only show if keys exist
    if (hasSeedPhrase()) {
      template.push({ type: 'separator' });
      template.push({
        label: 'Delete Stored Keys',
        click: async () => {
          const result = await dialog.showMessageBox({
            type: 'warning',
            buttons: ['Cancel', 'Delete'],
            defaultId: 0,
            cancelId: 0,
            title: 'Delete Stored Keys',
            message: 'This will permanently delete your stored seed phrase from this device. This action cannot be undone. Continue?',
          });
          if (result.response === 1) {
            try {
              deleteSeedPhrase();
              tray?.setContextMenu(buildTrayMenu());
              dialog.showMessageBox({
                type: 'info',
                title: 'Keys Deleted',
                message: 'Your stored seed phrase has been permanently deleted.',
              });
            } catch (error) {
              dialog.showErrorBox('Delete Failed', error instanceof Error ? error.message : 'Failed to delete keys');
            }
          }
        },
      });
    }
```

- [ ] **Step 5: 타입 체크**

```bash
npx tsc -p tsconfig.electron.json --noEmit
```

예상: 통과

- [ ] **Step 6: 커밋**

```bash
git add src/main/index.ts
git commit -m "feat: register keystore/network-guard IPC handlers and add tray menu delete option"
```

---

## Task 7: SetupPage에 Step 6 추가

**파일:**
- 수정: `src/renderer/pages/SetupPage.tsx`
- 수정: `src/renderer/pages/SetupPage.css`

- [ ] **Step 1: steps 초기 상태에 keysetup 추가**

`SetupPage.tsx`의 `useState<Record<string, StepState>>` 초기값에 추가:

```typescript
const [steps, setSteps] = useState<Record<string, StepState>>({
  docker: { status: 'pending', detail: 'Waiting...' },
  images: { status: 'pending', detail: 'Waiting...' },
  containers: { status: 'pending', detail: 'Waiting...' },
  deps: { status: 'pending', detail: 'Waiting...' },
  ready: { status: 'pending', detail: 'Waiting...' },
  keysetup: { status: 'pending', detail: 'Waiting...' },   // 추가
});
```

`runSetup` 내 `setSteps` 리셋 블록에도 동일하게 `keysetup` 추가.

- [ ] **Step 2: Step 6 관련 state 추가**

기존 state 선언 영역(`portModal` 아래)에 추가:

```typescript
const [showKeySetup, setShowKeySetup] = useState(false);
const [seedInput, setSeedInput] = useState('');
const [seedValid, setSeedValid] = useState<boolean | null>(null);
const [seedAddresses, setSeedAddresses] = useState<Record<string, string> | null>(null);
const [keystoreAvailable, setKeystoreAvailable] = useState(true);
const [savingKeys, setSavingKeys] = useState(false);
```

- [ ] **Step 3: runSetup 함수에서 onComplete() 대신 Step 6 표시로 변경**

`runSetup` 함수 끝부분(라인 417~420)을 다음으로 교체:

```typescript
    // 기존 코드:
    // runningRef.current = false;
    // logCleanup();
    // await new Promise(r => setTimeout(r, 600));
    // onComplete();

    // 새 코드: Step 5 완료 후 Step 6으로 전환
    runningRef.current = false;
    logCleanup();

    updateStep('keysetup', { status: 'loading', detail: 'Ready for input' });

    // Check safeStorage availability
    try {
      const available = await api.keystore.isAvailable();
      setKeystoreAvailable(available);
    } catch {
      setKeystoreAvailable(false);
    }

    setShowKeySetup(true);
```

- [ ] **Step 4: seed phrase 검증 핸들러 추가**

컴포넌트 내에 핸들러 함수 추가 (`handleRetry` 근처):

```typescript
  const handleSeedChange = async (value: string) => {
    setSeedInput(value);
    setSeedAddresses(null);
    setSeedValid(null);

    const trimmed = value.trim();
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length !== 12 && words.length !== 24) {
      if (words.length > 0) setSeedValid(false);
      return;
    }

    try {
      const valid = await api.keystore.validate(trimmed);
      setSeedValid(valid);
      if (valid) {
        // Preview addresses in-memory without persisting to disk
        const addrs = await api.keystore.previewAddresses(trimmed);
        setSeedAddresses(addrs);
      }
    } catch {
      setSeedValid(false);
    }
  };

  const handleSaveKeys = async () => {
    if (!seedValid || savingKeys) return;
    setSavingKeys(true);
    try {
      await api.keystore.store(seedInput.trim());
      updateStep('keysetup', { status: 'success', detail: 'Keys stored securely' });
      await new Promise(r => setTimeout(r, 1000));
      onComplete();
    } catch (err: any) {
      updateStep('keysetup', { status: 'error', detail: 'Save failed' });
      setError({ title: 'Keystore Error', message: err.message || 'Failed to store seed phrase.' });
      setShowRetry(true);
    } finally {
      setSavingKeys(false);
    }
  };

  const handleSkipKeys = () => {
    updateStep('keysetup', { status: 'success', detail: 'Skipped' });
    onComplete();
  };
```

- [ ] **Step 5: JSX에 Step 6 StepItem + 입력 폼 추가**

`steps` div 내 StepItem 리스트 마지막(Step 5 뒤)에 추가:

```tsx
<StepItem index={6} title="L2 Key Setup" detail={steps.keysetup.detail} status={steps.keysetup.status} />
```

`error-box` 전에 Step 6 폼 추가:

```tsx
{showKeySetup && (
  <div className="key-setup-form">
    {!keystoreAvailable ? (
      <div className="key-setup-warning">
        <p>OS keychain is not available. Seed phrase storage is disabled on this system.</p>
        <button className="btn btn-outline" onClick={handleSkipKeys}>Skip</button>
      </div>
    ) : (
      <>
        <p className="key-setup-desc">
          Enter your seed phrase to enable L2 rollup deployment.
          Your phrase is encrypted locally and never sent over the network.
        </p>
        <textarea
          className="seed-input"
          placeholder="Enter 12 or 24 word seed phrase..."
          value={seedInput}
          onChange={(e) => handleSeedChange(e.target.value)}
          rows={3}
          spellCheck={false}
          autoComplete="off"
        />
        {seedValid === false && (
          <p className="seed-error">Invalid seed phrase. Must be 12 or 24 words.</p>
        )}
        {seedValid && seedAddresses && (
          <div className="seed-addresses">
            <p className="seed-addresses-title">Derived Addresses</p>
            <table>
              <tbody>
                {Object.entries(seedAddresses).map(([role, addr]) => (
                  <tr key={role}>
                    <td className="role-name">{role}</td>
                    <td className="role-path">m/44'/60'/0'/0/{
                      { admin: 0, proposer: 1, batcher: 2, challenger: 3, sequencer: 4 }[role]
                    }</td>
                    <td className="role-addr">{String(addr).slice(0, 6)}...{String(addr).slice(-4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="key-setup-buttons">
          <button className="btn btn-primary" onClick={handleSaveKeys} disabled={!seedValid || savingKeys}>
            {savingKeys ? 'Saving...' : 'Save & Continue'}
          </button>
          <button className="btn btn-outline" onClick={handleSkipKeys}>
            Skip for now
          </button>
        </div>
      </>
    )}
  </div>
)}
```

- [ ] **Step 6: SetupPage.css에 Step 6 스타일 추가**

파일 끝에 추가:

```css
/* Step 6: Key Setup */
.key-setup-form {
  margin-top: 20px;
  padding: 16px;
  background: var(--gray-100);
  border-radius: 10px;
}

.key-setup-desc {
  font-size: 13px;
  color: var(--gray-600);
  margin-bottom: 12px;
  line-height: 1.5;
}

.key-setup-warning {
  text-align: center;
}

.key-setup-warning p {
  font-size: 13px;
  color: var(--error);
  margin-bottom: 12px;
}

.seed-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  resize: none;
  outline: none;
  -webkit-text-security: disc;
}

.seed-input:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 2px rgba(0, 120, 255, 0.1);
}

.seed-error {
  font-size: 12px;
  color: var(--error);
  margin-top: 6px;
}

.seed-addresses {
  margin-top: 12px;
  background: white;
  border-radius: 8px;
  padding: 10px 12px;
  border: 1px solid var(--gray-200);
}

.seed-addresses-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--success);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.seed-addresses table {
  width: 100%;
  font-size: 12px;
}

.seed-addresses td {
  padding: 3px 0;
}

.role-name {
  font-weight: 600;
  color: var(--dark);
  text-transform: capitalize;
  width: 90px;
}

.role-path {
  color: var(--gray-400);
  font-family: 'SF Mono', monospace;
  font-size: 11px;
}

.role-addr {
  color: var(--gray-600);
  font-family: 'SF Mono', monospace;
  text-align: right;
}

.key-setup-buttons {
  margin-top: 16px;
  display: flex;
  gap: 10px;
  justify-content: center;
}
```

- [ ] **Step 7: 타입 체크**

```bash
npx tsc -p tsconfig.renderer.json --noEmit && npx tsc -p tsconfig.electron.json --noEmit
```

예상: 통과

- [ ] **Step 8: 커밋**

```bash
git add src/renderer/pages/SetupPage.tsx src/renderer/pages/SetupPage.css
git commit -m "feat: add Step 6 (L2 Key Setup) to SetupPage with seed phrase input and address preview"
```

---

## Task 8: Mock ElectronAPI에 keystore/networkGuard 추가

**파일:**
- 수정: `src/renderer/mock/electronAPI.ts`

- [ ] **Step 1: mock 객체에 keystore/networkGuard 추가**

`mockElectronAPI` 객체의 `notifications` 블록 뒤에 추가:

```typescript
  keystore: {
    store: async (mnemonic: string) => {
      emit(logListeners, `[mock] Stored seed phrase (${mnemonic.split(/\s+/).length} words)`);
      localStorage.setItem('mock-keystore', 'true');
      localStorage.setItem('mock-addresses', JSON.stringify({
        admin: '0x1234...mock-admin',
        proposer: '0x5678...mock-proposer',
        batcher: '0x9abc...mock-batcher',
        challenger: '0xdef0...mock-challenger',
        sequencer: '0x1357...mock-sequencer',
      }));
    },
    has: async () => localStorage.getItem('mock-keystore') === 'true',
    isAvailable: async () => true,
    getAddresses: async () => {
      const stored = localStorage.getItem('mock-addresses');
      if (!stored) throw new Error('No seed phrase stored');
      return JSON.parse(stored);
    },
    delete: async () => {
      localStorage.removeItem('mock-keystore');
      localStorage.removeItem('mock-addresses');
      emit(logListeners, '[mock] Deleted stored keys');
    },
    validate: async (mnemonic: string) => {
      const words = mnemonic.trim().split(/\s+/);
      return words.length === 12 || words.length === 24;
    },
  },

  networkGuard: {
    getBlockedRequests: async () => [],
  },
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc -p tsconfig.renderer.json --noEmit
```

예상: 통과

- [ ] **Step 3: 커밋**

```bash
git add src/renderer/mock/electronAPI.ts
git commit -m "feat: add keystore and networkGuard mock for browser dev mode"
```

---

## Task 9: 통합 빌드 검증

**파일:** 전체

- [ ] **Step 1: 전체 빌드 확인**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && command npm run build
```

예상: 에러 없이 빌드 완료

- [ ] **Step 2: dev:browser 모드로 UI 검증**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && command npm run dev:browser
```

브라우저에서 `http://localhost:5173/?scenario=fresh` 접속:
1. ConfigPage → Continue 클릭
2. Step 1~5 자동 진행
3. Step 6 폼 표시 확인
4. 아무 12단어 입력 → validate 호출 확인
5. "Skip for now" 클릭 → WebApp 전환 확인

- [ ] **Step 3: 커밋 (빌드 수정이 필요한 경우)**

```bash
git add -A
git commit -m "fix: resolve build issues for keystore and network guard integration"
```

---

## Task 10: 최종 통합 커밋

- [ ] **Step 1: 전체 변경 사항 확인**

```bash
git log --oneline -10
```

- [ ] **Step 2: dev 모드로 Electron 앱 실행 확인 (Docker 필요)**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && command npm run dev
```

확인 사항:
1. 앱 시작 시 `[NetworkGuard] Initialized with whitelist` 콘솔 로그
2. SetupPage Step 6 표시 (Docker 환경이 있을 때 Step 5까지 자동 진행 후)
3. 트레이 메뉴에 "Delete Stored Keys" 항목 (키 저장 후에만 표시)

---

## 태스크 의존성

```
Task 1 (ethers 설치)
    ↓
Task 2 (타입 정의)
    ↓
Task 3 (keystore.ts) ──┐
    ↓                   │
Task 4 (network-guard.ts)
    ↓                   │
Task 5 (preload.ts) ◄──┘
    ↓
Task 6 (index.ts)
    ↓
Task 7 (SetupPage Step 6)
    ↓
Task 8 (Mock 업데이트)
    ↓
Task 9 (통합 빌드 검증)
    ↓
Task 10 (최종 확인)
```
