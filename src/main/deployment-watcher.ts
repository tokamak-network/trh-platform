/**
 * deployment-watcher.ts
 *
 * Polls the backend API every DEPLOYMENT_POLL_INTERVAL_MS to detect
 * stack/integration status transitions and fires OS + in-app notifications.
 *
 * Lifecycle:
 *   start(getToken) — begins polling after platform is ready
 *   stop()          — clears interval on app quit
 *   poll(getToken)  — public for testing; one poll cycle
 */

import { Notification } from 'electron';
import * as NotificationStore from './notifications';

const DEPLOYMENT_POLL_INTERVAL_MS = 10_000;

type StackStatus =
  | 'Deploying'
  | 'Updating'
  | 'Deployed'
  | 'FailedToDeploy'
  | 'FailedToUpdate'
  | 'Idle'
  | string;

interface StackEntry {
  id: string;
  name: string;
  status: StackStatus;
}

interface IntegrationEntry {
  id: string;
  type: string;
  status: string;
}

export class DeploymentWatcher {
  private readonly backendUrl: string;
  private previousStackStates = new Map<string, StackStatus>();
  private previousIntegrationStates = new Map<string, string>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(backendUrl: string) {
    this.backendUrl = backendUrl;
  }

  /** Start polling. getToken is called on every cycle to get a fresh token. */
  start(getToken: () => string | null): void {
    if (this.intervalHandle !== null) return; // already running
    this.intervalHandle = setInterval(() => {
      void this.poll(getToken);
    }, DEPLOYMENT_POLL_INTERVAL_MS);
  }

  /** Stop polling. Safe to call multiple times. */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * One poll cycle. Exported for unit testing.
   * Skips silently if token is null or if any fetch fails.
   */
  async poll(getToken: () => string | null): Promise<void> {
    const token = getToken();
    if (!token) return;

    try {
      const stacks = await this.fetchStacks(token);

      // Fetch integrations for all stacks in parallel to avoid exceeding poll interval
      const integrationSets = await Promise.all(
        stacks.map((stack) => this.fetchIntegrations(stack.id, token)),
      );

      for (let i = 0; i < stacks.length; i++) {
        const stack = stacks[i];
        const prev = this.previousStackStates.get(stack.id);
        await this.detectStackTransition(stack, prev, token);
        this.previousStackStates.set(stack.id, stack.status);

        const integrations = integrationSets[i];
        for (const integration of integrations) {
          const prevInteg = this.previousIntegrationStates.get(integration.id);
          this.detectIntegrationTransition(integration, prevInteg);
          this.previousIntegrationStates.set(integration.id, integration.status);
        }
      }
    } catch {
      // Network/timeout errors are expected during polling — skip this cycle silently
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchStacks(token: string): Promise<StackEntry[]> {
    const resp = await fetch(`${this.backendUrl}/api/v1/stacks/thanos`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) return [];
    const body = await resp.json() as Record<string, unknown>;
    const data = (body.data ?? body) as Record<string, unknown>;
    const stacks = (data.stacks ?? []) as StackEntry[];
    return stacks;
  }

  private async fetchIntegrations(stackId: string, token: string): Promise<IntegrationEntry[]> {
    try {
      const resp = await fetch(
        `${this.backendUrl}/api/v1/stacks/thanos/${stackId}/integrations`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!resp.ok) return [];
      const body = await resp.json() as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      return (data.integrations ?? []) as IntegrationEntry[];
    } catch {
      return [];
    }
  }

  private async detectStackTransition(
    stack: StackEntry,
    prevStatus: StackStatus | undefined,
    token: string,
  ): Promise<void> {
    if (prevStatus === undefined) return; // initial snapshot — no notification

    const wasInProgress = prevStatus === 'Deploying' || prevStatus === 'Updating';
    if (!wasInProgress) return;

    if (stack.status === 'Deployed') {
      this.fire(
        'L2 Deployment Complete',
        `"${stack.name}" is now deployed and running.`,
      );
    } else if (stack.status === 'FailedToDeploy' || stack.status === 'FailedToUpdate') {
      const detail = await this.fetchFailureReason(stack.id, token);
      this.fire(
        'L2 Deployment Failed',
        `"${stack.name}" deployment failed. Check the dashboard for details.`,
        detail,
      );
    }
  }

  private detectIntegrationTransition(
    integration: IntegrationEntry,
    prevStatus: string | undefined,
  ): void {
    if (prevStatus === undefined) return; // initial snapshot
    if (prevStatus !== 'InProgress') return;

    if (integration.status === 'Completed') {
      this.fire(
        'Service Deployment Complete',
        `"${integration.type}" service is now running.`,
      );
    } else if (integration.status === 'Failed') {
      this.fire(
        'Service Deployment Failed',
        `"${integration.type}" service deployment failed.`,
      );
    }
  }

  /**
   * Fetches the latest failed deployment and extracts the failure reason from logs.
   * Returns undefined on any error so the caller always gets a notification even
   * if the reason cannot be determined.
   */
  private async fetchFailureReason(stackId: string, token: string): Promise<string | undefined> {
    try {
      // Step 1: get the latest deployment for this stack
      const depResp = await fetch(
        `${this.backendUrl}/api/v1/stacks/thanos/${stackId}/deployments?limit=1`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!depResp.ok) return undefined;

      const depBody = await depResp.json() as Record<string, unknown>;
      const depData = (depBody.data ?? depBody) as Record<string, unknown>;
      const deployments = (depData.deployments ?? []) as Array<{ id: string }>;
      if (deployments.length === 0) return undefined;
      const deploymentId = deployments[0].id;

      // Step 2: fetch the last 50 log lines for that deployment
      const logResp = await fetch(
        `${this.backendUrl}/api/v1/stacks/thanos/${stackId}/deployments/${deploymentId}/logs?limit=50`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!logResp.ok) return undefined;

      const logBody = await logResp.json() as Record<string, unknown>;
      const logData = (logBody.data ?? logBody) as Record<string, unknown>;
      const logs = (logData.logs ?? []) as string[];

      return this.extractFailureReason(logs);
    } catch {
      return undefined;
    }
  }

  /**
   * Extracts a human-readable failure reason from log lines (JSON Lines format).
   * Priority:
   *   1. Last log entry with level === "error" → its message field
   *   2. Last non-empty raw line
   *   3. undefined
   */
  private extractFailureReason(logLines: string[]): string | undefined {
    // Pass 1: last JSON line with level === "error"
    for (let i = logLines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(logLines[i]) as { level?: string; message?: string };
        if (entry.level === 'error' && entry.message) return entry.message;
      } catch { /* raw text line — skip */ }
    }
    // Pass 2: last non-empty raw line
    for (let i = logLines.length - 1; i >= 0; i--) {
      if (logLines[i].trim()) return logLines[i].trim();
    }
    return undefined;
  }

  private fire(title: string, body: string, detail?: string): void {
    // In-app notification (always)
    NotificationStore.add({ type: 'deployment', title, message: body, detail });

    // OS desktop notification (if supported)
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  }
}
