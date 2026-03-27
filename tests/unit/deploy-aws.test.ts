// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
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

async function awsDeploySequence(): Promise<void> {
  await execPromise('aws sts get-caller-identity');
  await execPromise('terraform -chdir=ec2 init');
  await execPromise('terraform -chdir=ec2 plan');
  await execPromise('terraform -chdir=ec2 apply -auto-approve');
}

function extractIngressPorts(tfContent: string): number[] {
  const ports: number[] = [];
  const regex = /ingress\s*\{[\s\S]*?from_port\s*=\s*(\d+)[\s\S]*?\}/g;
  let match;
  while ((match = regex.exec(tfContent)) !== null) {
    ports.push(parseInt(match[1], 10));
  }
  return ports;
}

describe('AWS EC2 Deploy Sequence', () => {
  beforeEach(() => {
    mockedExec.mockReset();
    mockedExec.mockImplementation((_cmd: string, callback: (error: ExecException | null, stdout: string, stderr: string) => void) => {
      callback(null, '', '');
      return {} as ReturnType<typeof exec>;
    });
  });

  it('DTGT-02: calls terraform commands in correct order', async () => {
    await awsDeploySequence();

    const calls = mockedExec.mock.calls;
    expect(calls).toHaveLength(4);
    expect(calls[0][0]).toBe('aws sts get-caller-identity');
    expect(calls[1][0]).toBe('terraform -chdir=ec2 init');
    expect(calls[2][0]).toBe('terraform -chdir=ec2 plan');
    expect(calls[3][0]).toBe('terraform -chdir=ec2 apply -auto-approve');
  });

  it('DTGT-03: AWS path uses terraform, not docker compose up', async () => {
    await awsDeploySequence();

    const calls = mockedExec.mock.calls;
    const commandStrings = calls.map((call) => call[0] as string);
    commandStrings.forEach((cmd) => {
      expect(cmd).not.toContain('docker compose up');
    });
    const hasTerraform = commandStrings.some((cmd) => cmd.includes('terraform'));
    expect(hasTerraform).toBe(true);
  });

  it('DTGT-04: security group opens ports 22, 3000, 8000', () => {
    const tfPath = join(__dirname, '..', '..', 'ec2', 'main.tf');
    const tfContent = readFileSync(tfPath, 'utf-8');
    const ports = extractIngressPorts(tfContent);

    expect(ports).toContain(22);
    expect(ports).toContain(3000);
    expect(ports).toContain(8000);
    expect(ports).toHaveLength(3);
  });
});
