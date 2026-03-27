// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { loadCompose } from '../helpers/load-compose';

const compose = loadCompose();

describe('Docker Compose Schema (resources/docker-compose.yml)', () => {
  it('DOCK-01: valid services and volumes structure', () => {
    const serviceNames = Object.keys(compose.services);
    expect(serviceNames).toContain('postgres');
    expect(serviceNames).toContain('backend');
    expect(serviceNames).toContain('platform-ui');
    expect(compose.volumes).toBeDefined();
    expect(Object.keys(compose.volumes!)).toContain('trh_postgres_data');
  });

  it('DOCK-02: dependency order postgres -> backend -> platform-ui', () => {
    const backendDeps = compose.services['backend'].depends_on;
    expect(backendDeps).toBeDefined();
    expect(typeof backendDeps).toBe('object');
    expect(Array.isArray(backendDeps)).toBe(false);
    const backendDepsRecord = backendDeps as Record<string, { condition: string }>;
    expect(backendDepsRecord['postgres']).toBeDefined();
    expect(backendDepsRecord['postgres'].condition).toBe('service_healthy');

    const platformDeps = compose.services['platform-ui'].depends_on;
    expect(platformDeps).toBeDefined();
    expect(typeof platformDeps).toBe('object');
    expect(Array.isArray(platformDeps)).toBe(false);
    const platformDepsRecord = platformDeps as Record<string, { condition: string }>;
    expect(platformDepsRecord['backend']).toBeDefined();
    expect(platformDepsRecord['backend'].condition).toBe('service_healthy');
  });

  it('DOCK-03: healthcheck defined for postgres and backend', () => {
    const postgresHealthcheck = compose.services['postgres'].healthcheck;
    expect(postgresHealthcheck).toBeDefined();
    const postgresTest = postgresHealthcheck!.test;
    const postgresTestStr = Array.isArray(postgresTest) ? postgresTest.join(' ') : postgresTest;
    expect(postgresTestStr).toContain('pg_isready');

    const backendHealthcheck = compose.services['backend'].healthcheck;
    expect(backendHealthcheck).toBeDefined();
    const backendTest = backendHealthcheck!.test;
    const backendTestStr = Array.isArray(backendTest) ? backendTest.join(' ') : backendTest;
    expect(backendTestStr).toContain('curl');
  });

  it('DOCK-04: required environment variables per service', () => {
    const getEnvKeys = (env: Record<string, string | number> | string[] | undefined): string[] => {
      if (!env) return [];
      if (Array.isArray(env)) return env.map((e) => e.split('=')[0]);
      return Object.keys(env);
    };

    const postgresEnv = getEnvKeys(compose.services['postgres'].environment as Record<string, string | number>);
    expect(postgresEnv).toContain('POSTGRES_USER');
    expect(postgresEnv).toContain('POSTGRES_PASSWORD');
    expect(postgresEnv).toContain('POSTGRES_DB');

    const backendEnv = getEnvKeys(compose.services['backend'].environment as Record<string, string | number>);
    expect(backendEnv).toContain('PORT');

    const platformEnv = getEnvKeys(compose.services['platform-ui'].environment as Record<string, string | number>);
    expect(platformEnv).toContain('NEXT_PUBLIC_API_BASE_URL');
  });
});
