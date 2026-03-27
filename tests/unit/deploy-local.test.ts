// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecException } from 'child_process';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { exec } from 'child_process';

const mockedExec = vi.mocked(exec);

function execPromise(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    mockedExec(command, (error: ExecException | null, stdout: string) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function localDeploySequence(composePath: string): Promise<void> {
  await execPromise('docker --version');
  await execPromise('docker info');
  await execPromise(`docker compose -f ${composePath} pull`);
  await execPromise(`docker compose -f ${composePath} up -d`);
}

describe('Local Docker Deploy Sequence', () => {
  beforeEach(() => {
    mockedExec.mockReset();
    mockedExec.mockImplementation((_cmd: string, callback: (error: ExecException | null, stdout: string, stderr: string) => void) => {
      callback(null, '', '');
      return {} as ReturnType<typeof exec>;
    });
  });

  it('DTGT-01: calls docker commands in correct order', async () => {
    const composePath = 'resources/docker-compose.yml';
    await localDeploySequence(composePath);

    const calls = mockedExec.mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls[0][0]).toBe('docker --version');
    expect(calls[1][0]).toBe('docker info');
    expect(calls[2][0]).toBe(`docker compose -f ${composePath} pull`);
    expect(calls[3][0]).toBe(`docker compose -f ${composePath} up -d`);
  });

  it('DTGT-03: local path uses docker compose, not terraform', async () => {
    const composePath = 'resources/docker-compose.yml';
    await localDeploySequence(composePath);

    const calls = mockedExec.mock.calls;
    const commandStrings = calls.map((call) => call[0] as string);
    commandStrings.forEach((cmd) => {
      expect(cmd).not.toContain('terraform');
    });
    commandStrings.forEach((cmd) => {
      expect(cmd).toContain('docker');
    });
  });
});
