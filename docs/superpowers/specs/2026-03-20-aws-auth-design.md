# AWS Credential Management — Electron Local Management

**Date:** 2026-03-20
**Status:** Approved

## Problem

Current architecture stores AWS access keys permanently in the backend database. Users cannot verify that keys aren't exfiltrated. Seed phrases and private keys also pass through the backend.

## Solution

Move AWS credential management to the Electron app. Credentials stay in memory only, passed to backend only during deployment requests.

## Architecture

```
[User]
   ├── AWS SSO Login (browser) → temporary token (1hr)
   └── ~/.aws/credentials profile select → read existing keys
         ↓
[Electron Main Process] — credentials in memory only
         ↓ (deployment request only)
[Backend API] POST /stacks/thanos — AWS keys in request body
         ↓
[Backend] AWS SDK deploys infra → discards keys after
```

## Changes

| Item | Current | After |
|------|---------|-------|
| AWS key storage | Backend DB (permanent) | Electron memory (app exit = gone) |
| Key input method | Manual web UI entry | SSO login or CLI profile auto-detect |
| Key transfer | Config → DB → query at deploy | 1-time pass to backend at deploy only |
| Scope | AWS deployments only | AWS deployments only (local deploy needs no AWS) |

## Components

### 1. `src/main/aws-auth.ts` — Electron Main Process

- `listProfiles()` — parse `~/.aws/credentials` + `~/.aws/config`, return profile list
- `loadProfile(name)` — read selected profile's access key/secret key
- `startSsoLogin(startUrl, region)` — OIDC device auth flow, open browser, receive temp token
- `getCredentials()` — return current active credentials (memory)
- `clearCredentials()` — delete from memory

### 2. Electron IPC Handlers

- `aws-auth:list-profiles` → profile list
- `aws-auth:load-profile` → load profile keys
- `aws-auth:sso-login` → start SSO login
- `aws-auth:get-credentials` → current credentials (if any)
- `aws-auth:clear` → clear

### 3. trh-platform-ui `AwsConfig.tsx` Changes

- Current: dropdown of backend-stored credentials
- Changed: detect `window.__TRH_AWS_CREDENTIALS__` injection
  - Present → "AWS credentials provided by TRH Desktop" read-only display
  - Absent → existing UI preserved (web standalone use)

### 4. Backend Changes

- `POST /stacks/thanos` already accepts AWS keys in body — no change needed
- Credential storage API not called by Electron (retained for web standalone)

## SSO Login Flow

1. User enters SSO Start URL + Region
2. Electron → AWS OIDC `registerClient` → clientId, clientSecret
3. Electron → `startDeviceAuthorization` → verificationUri, userCode
4. `shell.openExternal(verificationUri)` — browser AWS login
5. Electron polls `createToken` (5s interval, max 5min)
6. Token received → `getRoleCredentials` → accessKeyId, secretAccessKey, sessionToken
7. Store in memory, track expiration

## Error Handling

- SSO timeout (no login within 5min) → "Login timed out" message
- `~/.aws/credentials` missing → show SSO option only
- Temp token expired → prompt re-login
- Invalid profile → "Invalid credentials" error

## Testing

- `aws-auth.test.ts` — credentials file parsing, profile load, memory management
- AwsConfig injection detection test
