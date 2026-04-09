#!/usr/bin/env node
/**
 * Smoke test for the update-check registry flow.
 *
 * Tests two things:
 *   1. Can we reach Docker Hub and fetch a remote manifest digest?
 *   2. Does it match (or differ from) the locally pulled image?
 *
 * Usage:
 *   node scripts/smoke-update-check.js
 *
 * Docker does NOT need to be running for step 1.
 * Step 2 requires Docker and the images to be present locally.
 */

const https = require('https');
const { exec } = require('child_process');

const IMAGES = [
  'tokamaknetwork/trh-backend:latest',
  'tokamaknetwork/trh-platform-ui:latest',
];

// ─── registry helpers ────────────────────────────────────────────────────────

function getToken(namespace, repo) {
  return new Promise((resolve, reject) => {
    https.get(
      `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${namespace}/${repo}:pull`,
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data).token);
          } catch (e) {
            reject(new Error('Failed to parse auth token'));
          }
        });
      }
    ).on('error', reject);
  });
}

function getRemoteDigest(image) {
  const colonIdx = image.lastIndexOf(':');
  const tag = colonIdx !== -1 ? image.slice(colonIdx + 1) : 'latest';
  const name = colonIdx !== -1 ? image.slice(0, colonIdx) : image;
  const slashIdx = name.indexOf('/');
  const namespace = slashIdx !== -1 ? name.slice(0, slashIdx) : 'library';
  const repo = slashIdx !== -1 ? name.slice(slashIdx + 1) : name;

  return getToken(namespace, repo).then(
    (token) =>
      new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: 'registry-1.docker.io',
            path: `/v2/${namespace}/${repo}/manifests/${tag}`,
            method: 'HEAD',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: [
                'application/vnd.docker.distribution.manifest.list.v2+json',
                'application/vnd.docker.distribution.manifest.v2+json',
              ].join(','),
            },
          },
          (res) => {
            const digest = res.headers['docker-content-digest'];
            if (digest) resolve(digest);
            else reject(new Error(`No Docker-Content-Digest header (HTTP ${res.statusCode})`));
          }
        );
        req.on('error', reject);
        req.end();
      })
  );
}

// ─── local docker helper ─────────────────────────────────────────────────────

function getLocalDigest(image) {
  return new Promise((resolve) => {
    exec(
      `docker image inspect "${image}" --format "{{index .RepoDigests 0}}"`,
      { timeout: 10000 },
      (err, stdout) => {
        if (err) { resolve(null); return; }
        const match = stdout.trim().match(/@(sha256:[a-f0-9]+)/);
        resolve(match ? match[1] : null);
      }
    );
  });
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Update Check Smoke Test ===\n');

  for (const image of IMAGES) {
    console.log(`Image: ${image}`);

    // 1. Remote digest (registry API)
    let remote = null;
    try {
      remote = await getRemoteDigest(image);
      console.log(`  remote : ${remote}`);
    } catch (e) {
      console.error(`  remote : FAILED — ${e.message}`);
    }

    // 2. Local digest (docker inspect)
    const local = await getLocalDigest(image);
    if (local === null) {
      console.log(`  local  : not present (Docker not running or image not pulled)`);
    } else {
      console.log(`  local  : ${local}`);
    }

    // 3. Verdict
    if (remote && local) {
      if (remote === local) {
        console.log(`  status : UP TO DATE`);
      } else {
        console.log(`  status : UPDATE AVAILABLE`);
      }
    } else if (remote && !local) {
      console.log(`  status : (cannot compare — no local image)`);
    } else {
      console.log(`  status : (registry unreachable)`);
    }

    console.log();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
