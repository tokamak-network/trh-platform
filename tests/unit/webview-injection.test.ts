// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PresetDeployRequestSchema } from '../schemas/api-contract.schema';
import { DesktopAccountsSchema, AwsCredentialsSchema } from '../schemas/webview.schema';

// ---------------------------------------------------------------------------
// Backend API Contract (IPC-04)
// ---------------------------------------------------------------------------

describe('Backend API Contract (IPC-04)', () => {
  it('IPC-04: valid preset-deploy request passes schema', () => {
    const result = PresetDeployRequestSchema.parse({
      presetId: 'general',
      chainName: 'my-l2',
      network: 'Testnet',
      seedPhrase: 'test test test test test test test test test test test junk',
      infraProvider: 'local',
      l1RpcUrl: 'http://localhost:8545',
      l1BeaconUrl: 'http://localhost:5052',
    });
    expect(result.presetId).toBe('general');
    expect(result.network).toBe('Testnet');
    expect(result.infraProvider).toBe('local');
  });

  it('IPC-04: preset-deploy request with AWS fields passes schema', () => {
    const result = PresetDeployRequestSchema.parse({
      presetId: 'defi',
      chainName: 'defi-chain',
      network: 'Mainnet',
      seedPhrase: 'test test test test test test test test test test test junk',
      infraProvider: 'aws',
      awsAccessKey: 'AKIAIOSFODNN7EXAMPLE',
      awsSecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      awsRegion: 'ap-northeast-2',
      l1RpcUrl: 'https://mainnet.infura.io/v3/example',
      l1BeaconUrl: 'https://beacon.example.com',
      feeToken: 'TON',
      reuseDeployment: false,
      overrides: [{ field: 'challengePeriod', value: 7200 }],
    });
    expect(result.infraProvider).toBe('aws');
    expect(result.awsAccessKey).toBe('AKIAIOSFODNN7EXAMPLE');
    expect(result.overrides).toHaveLength(1);
    expect(result.overrides![0].field).toBe('challengePeriod');
    expect(result.overrides![0].value).toBe(7200);
  });

  it('IPC-04: preset-deploy request rejects missing required fields', () => {
    expect(() =>
      PresetDeployRequestSchema.parse({ presetId: 'general' })
    ).toThrow();
  });

  it('IPC-04: preset-deploy request rejects invalid network value', () => {
    expect(() =>
      PresetDeployRequestSchema.parse({
        presetId: 'general',
        chainName: 'my-l2',
        network: 'InvalidNet',
        seedPhrase: 'test test test test test test test test test test test junk',
        infraProvider: 'local',
        l1RpcUrl: 'http://localhost:8545',
        l1BeaconUrl: 'http://localhost:5052',
      })
    ).toThrow();
  });

  it('IPC-04: preset-deploy request rejects invalid infraProvider', () => {
    expect(() =>
      PresetDeployRequestSchema.parse({
        presetId: 'general',
        chainName: 'my-l2',
        network: 'Testnet',
        seedPhrase: 'test test test test test test test test test test test junk',
        infraProvider: 'gcp',
        l1RpcUrl: 'http://localhost:8545',
        l1BeaconUrl: 'http://localhost:5052',
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// WebView Injection (IPC-05)
// ---------------------------------------------------------------------------

describe('WebView Injection (IPC-05)', () => {
  const validAccountPayload = {
    admin: { address: '0x1234567890123456789012345678901234567890', privateKey: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab' },
    proposer: { address: '0x2345678901234567890123456789012345678901', privateKey: '0xbcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abc' },
    batcher: { address: '0x3456789012345678901234567890123456789012', privateKey: '0xcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd' },
    challenger: { address: '0x4567890123456789012345678901234567890123', privateKey: '0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde' },
    sequencer: { address: '0x5678901234567890123456789012345678901234', privateKey: '0xef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' },
  };

  it('IPC-05: valid desktop accounts payload passes schema', () => {
    const result = DesktopAccountsSchema.parse(validAccountPayload);
    expect(result.admin.address).toMatch(/^0x/);
    expect(result.proposer.privateKey).toMatch(/^0x/);
    expect(result.batcher).toBeDefined();
    expect(result.challenger).toBeDefined();
    expect(result.sequencer).toBeDefined();
  });

  it('IPC-05: desktop accounts rejects missing role', () => {
    const { sequencer: _omitted, ...withoutSequencer } = validAccountPayload;
    expect(() => DesktopAccountsSchema.parse(withoutSequencer)).toThrow();
  });

  it('IPC-05: desktop accounts rejects non-0x address', () => {
    expect(() =>
      DesktopAccountsSchema.parse({
        ...validAccountPayload,
        admin: { address: 'invalid', privateKey: '0xabcd1234' },
      })
    ).toThrow();
  });

  it('IPC-05: valid AWS credentials payload passes schema', () => {
    const result = AwsCredentialsSchema.parse({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      source: 'sso',
    });
    expect(result.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
    expect(result.source).toBe('sso');
    expect(result.sessionToken).toBeUndefined();
  });

  it('IPC-05: AWS credentials with sessionToken passes schema', () => {
    const result = AwsCredentialsSchema.parse({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      sessionToken: 'AQoXnyc4lcK4w4yMg...',
      source: 'sso',
    });
    expect(result.sessionToken).toBe('AQoXnyc4lcK4w4yMg...');
  });

  it('IPC-05: AWS credentials rejects empty accessKeyId', () => {
    expect(() =>
      AwsCredentialsSchema.parse({
        accessKeyId: '',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        source: 'sso',
      })
    ).toThrow();
  });

  // -------------------------------------------------------------------------
  // Static analysis: webview.ts injection code validation
  // -------------------------------------------------------------------------

  const webviewSource = readFileSync(
    join(__dirname, '..', '..', 'src', 'main', 'webview.ts'),
    'utf-8'
  );

  it('IPC-05: webview.ts contains __TRH_DESKTOP_ACCOUNTS__ injection', () => {
    expect(webviewSource).toContain('__TRH_DESKTOP_ACCOUNTS__');
  });

  it('IPC-05: webview.ts contains __TRH_AWS_CREDENTIALS__ injection', () => {
    expect(webviewSource).toContain('__TRH_AWS_CREDENTIALS__');
  });

  it('IPC-05: webview.ts injection covers all 5 account roles', () => {
    expect(webviewSource).toContain('admin');
    expect(webviewSource).toContain('proposer');
    expect(webviewSource).toContain('batcher');
    expect(webviewSource).toContain('challenger');
    expect(webviewSource).toContain('sequencer');
  });

  it('IPC-05: webview.ts injection covers AWS credential fields', () => {
    expect(webviewSource).toContain('accessKeyId');
    expect(webviewSource).toContain('secretAccessKey');
    expect(webviewSource).toContain('sessionToken');
    expect(webviewSource).toContain('source');
  });
});
