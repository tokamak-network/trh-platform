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
        this.detectStackTransition(stack, prev);
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

  private detectStackTransition(stack: StackEntry, prevStatus: StackStatus | undefined): void {
    if (prevStatus === undefined) return; // initial snapshot — no notification

    const wasInProgress = prevStatus === 'Deploying' || prevStatus === 'Updating';
    if (!wasInProgress) return;

    if (stack.status === 'Deployed') {
      this.fire(
        'L2 Deployment Complete',
        `"${stack.name}" is now deployed and running.`,
      );
    } else if (stack.status === 'FailedToDeploy' || stack.status === 'FailedToUpdate') {
      this.fire(
        'L2 Deployment Failed',
        `"${stack.name}" deployment failed. Check the dashboard for details.`,
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

  private fire(title: string, body: string): void {
    // In-app notification (always)
    NotificationStore.add({ type: 'deployment', title, message: body });

    // OS desktop notification (if supported)
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  }
}
