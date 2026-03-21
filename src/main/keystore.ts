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
    const buf = Buffer.from(mnemonic);
    buf.fill(0);
  }

  return env;
}

export function getSeedWords(): string[] | null {
  if (!hasSeedPhrase()) return null;
  try {
    const mnemonic = decryptSeedPhrase();
    return mnemonic.split(/\s+/);
  } catch {
    return null;
  }
}

export function deleteSeedPhrase(): void {
  const keystorePath = getKeystorePath();
  if (fs.existsSync(keystorePath)) {
    fs.unlinkSync(keystorePath);
  }

  if (fs.existsSync(keystorePath)) {
    throw new Error('Failed to delete keystore file');
  }
}
