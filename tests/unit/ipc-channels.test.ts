// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Helper: extract IPC channel names from source file via regex
// ---------------------------------------------------------------------------

function extractChannels(filePath: string, regex: RegExp): Set<string> {
  const content = readFileSync(filePath, 'utf-8');
  const channels = new Set<string>();
  for (const match of content.matchAll(regex)) {
    channels.add(match[1]);
  }
  return channels;
}

// ---------------------------------------------------------------------------
// File paths (resolved relative to tests/unit/)
// ---------------------------------------------------------------------------

const preloadPath = join(__dirname, '..', '..', 'src', 'main', 'preload.ts');
const webviewPreloadPath = join(__dirname, '..', '..', 'src', 'main', 'webview-preload.ts');
const indexPath = join(__dirname, '..', '..', 'src', 'main', 'index.ts');
const webviewPath = join(__dirname, '..', '..', 'src', 'main', 'webview.ts');

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

const invokeRegex = /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g;
const handleRegex = /ipcMain\.handle\(['"]([^'"]+)['"]/g;
const onRegex = /ipcRenderer\.on\(['"]([^'"]+)['"]/g;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IPC Channel Registry (IPC-01)', () => {
  it('IPC-01: all preload.ts invoke channels have matching handlers', () => {
    const invokeChannels = extractChannels(preloadPath, invokeRegex);
    const indexHandleChannels = extractChannels(indexPath, handleRegex);
    const webviewHandleChannels = extractChannels(webviewPath, handleRegex);

    // Union of all handler registrations (index.ts + webview.ts)
    const allHandleChannels = new Set([...indexHandleChannels, ...webviewHandleChannels]);

    for (const channel of invokeChannels) {
      expect(
        allHandleChannels.has(channel),
        `Missing handler for invoke channel: ${channel}`
      ).toBe(true);
    }
  });

  it('IPC-01: all webview-preload.ts invoke channels have matching handlers', () => {
    const webviewInvokeChannels = extractChannels(webviewPreloadPath, invokeRegex);
    const indexHandleChannels = extractChannels(indexPath, handleRegex);
    const webviewHandleChannels = extractChannels(webviewPath, handleRegex);

    const allHandleChannels = new Set([...indexHandleChannels, ...webviewHandleChannels]);

    for (const channel of webviewInvokeChannels) {
      expect(
        allHandleChannels.has(channel),
        `Missing handler for invoke channel: ${channel}`
      ).toBe(true);
    }
  });

  it('IPC-01: no orphan handlers without corresponding invoke', () => {
    const preloadInvokeChannels = extractChannels(preloadPath, invokeRegex);
    const webviewPreloadInvokeChannels = extractChannels(webviewPreloadPath, invokeRegex);

    const allInvokeChannels = new Set([...preloadInvokeChannels, ...webviewPreloadInvokeChannels]);

    const indexHandleChannels = extractChannels(indexPath, handleRegex);
    const webviewHandleChannels = extractChannels(webviewPath, handleRegex);
    const allHandleChannels = new Set([...indexHandleChannels, ...webviewHandleChannels]);

    for (const channel of allHandleChannels) {
      expect(
        allInvokeChannels.has(channel),
        `Orphan handler with no corresponding invoke: ${channel}`
      ).toBe(true);
    }
  });

  it('IPC-01: preload.ts invoke channel count is at least 50', () => {
    const invokeChannels = extractChannels(preloadPath, invokeRegex);
    expect(invokeChannels.size).toBeGreaterThanOrEqual(50);
  });

  it('IPC-01: on channels are distinct from invoke channels', () => {
    const invokeChannels = extractChannels(preloadPath, invokeRegex);
    const onChannels = extractChannels(preloadPath, onRegex);

    const overlap = new Set([...invokeChannels].filter(ch => onChannels.has(ch)));
    expect(
      overlap.size,
      `Channels appear in both invoke and on: ${[...overlap].join(', ')}`
    ).toBe(0);
  });
});
