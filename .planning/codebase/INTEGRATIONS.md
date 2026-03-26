# External Integrations

**Analysis Date:** 2026-03-26

## APIs & External Services

**AWS Services:**
- AWS SSO (Single Sign-On)
  - What it's used for: Enterprise authentication, account/role enumeration for EC2 deployment
  - SDK/Client: @aws-sdk/client-sso-oidc (RegisterClientCommand, StartDeviceAuthorizationCommand, CreateTokenCommand)
  - SDK/Client: @aws-sdk/client-sso (GetRoleCredentialsCommand, ListAccountsCommand, ListAccountRolesCommand)
  - Implementation: `src/main/aws-auth.ts`
  - Auth: Credentials stored in `~/.aws/credentials` or loaded via SSO device authorization flow

**Blockchain/Web3:**
- Ethereum-compatible networks
  - What it's used for: Mnemonic validation, HD wallet derivation, private key generation for L2 roles
  - SDK/Client: ethers 6.13.4
  - Implementation: `src/main/keystore.ts`
  - Pattern: BIP44 derivation `m/44'/60'/0'/0/{index}` for roles (admin, proposer, batcher, challenger, sequencer)

**Docker Registry:**
- Docker Hub (tokamaknetwork organization)
  - What it's used for: Container image pulling and version management
  - Images:
    - `tokamaknetwork/trh-backend:latest` (API service)
    - `tokamaknetwork/trh-platform-ui:latest` (Frontend UI)
  - Downloaded via: Docker daemon during `docker compose pull`

**External URLs (OS-level):**
- Docker Desktop installer downloads
  - macOS ARM64: `https://desktop.docker.com/mac/main/arm64/Docker.dmg`
  - macOS AMD64: `https://desktop.docker.com/mac/main/amd64/Docker.dmg`
  - Windows: `https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe`
  - Linux setup script: `https://get.docker.com`
  - Implementation: `src/main/installer.ts`

## Data Storage

**Databases:**
- PostgreSQL 15
  - Connection: Configured via `config/.env.backend` (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST, POSTGRES_PORT)
  - Default: localhost:5432 (postgres/postgres)
  - Client: Docker container (tokamaknetwork/trh-backend manages connection)
  - Persistent volume: `postgres_data` (docker-compose.yml)

**File Storage:**
- Local filesystem only
  - Keystore encryption: `~/.config/TRH Desktop/keystore.enc` (Electron user data directory)
  - Backend storage: `trh_backend_storage` Docker volume
  - Resources: `resources/docker-compose.yml` bundled in application

**Caching:**
- None explicit. Credentials held in memory:
  - AWS credentials: `currentCredentials` variable in `src/main/aws-auth.ts`
  - SSO session state: `ssoAccessToken`, `ssoRegion` in-memory

## Authentication & Identity

**Auth Provider:**
- AWS IAM (for EC2 deployment)
  - Implementation: `src/main/aws-auth.ts`
  - Approach:
    - Static credentials from `~/.aws/credentials` file (INI format parser in code)
    - SSO device authorization flow (OIDC client registration, device code generation)
    - Credential expiration tracking (expiresAt in AwsCredentials interface)
  - Credential resolution order:
    1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    2. AWS credentials file (~/.aws/credentials)
    3. SSO session flow (interactive browser login)

**Application-level Auth:**
- JWT (JSON Web Tokens)
  - Secret stored in: `config/.env.backend` (JWT_SECRET)
  - Default admin: admin@gmail.com / admin (configurable)

**Keystore Management:**
- OS-level encryption via Electron safeStorage
  - Implementation: `src/main/keystore.ts`
  - Storage: Encrypted mnemonic in `~/.config/TRH Desktop/keystore.enc`
  - Security: Uses OS native keychain (macOS Keychain, Windows Credential Manager, Linux secret-service)
  - Derived keys: BIP44 HD wallet for 5 roles from single 12/24-word mnemonic

## Monitoring & Observability

**Error Tracking:**
- None detected. Errors logged to console/IPC callbacks

**Logs:**
- Console/stdout (IPC channels: docker:log, docker:status-update, docker:install-progress)
- Docker logs: Accessible via `docker compose logs -f`
- Backend logs: Stdout of trh-backend container

## CI/CD & Deployment

**Hosting:**
- AWS EC2 (optional, managed by Terraform)
  - Infrastructure: `ec2/main.tf` (instance, security group, key pair)
  - Provisioning: `install.sh` (node/docker setup), `make setup` (service startup)

**Local Development:**
- Docker Compose (docker-compose.yml)
  - 3 services: PostgreSQL, trh-backend, trh-platform-ui
  - Management: Makefile targets (make up, make down, make setup, etc.)

**Desktop Distribution:**
- Electron Builder
  - Targets: macOS (DMG), Windows (NSIS), Linux (AppImage)
  - Config: `package.json` build section

## Environment Configuration

**Required env vars:**

**Backend (`config/.env.backend`):**
- PORT=8000
- POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST, POSTGRES_PORT
- JWT_SECRET (custom)
- DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD (optional, defaults: admin@gmail.com / admin)

**Frontend (`config/.env.frontend`):**
- NEXT_PUBLIC_API_BASE_URL (default: http://localhost:8000)

**Docker (`config/.env.docker`):**
- TRH_BACKEND_VERSION (Docker image version)
- TRH_PLATFORM_UI_VERSION (Docker image version)

**AWS/EC2:**
- Environment set dynamically by aws-auth module
- Terraform vars in `ec2/.env` (generated by make ec2-setup)

**Secrets location:**
- `.env.*` files in `config/` and `ec2/` (git-ignored, not committed)
- AWS credentials: `~/.aws/credentials` (standard AWS location)
- Keystore: `~/.config/TRH Desktop/keystore.enc` (OS-encrypted)

## Webhooks & Callbacks

**Incoming:**
- None detected. No webhook servers implemented

**Outgoing:**
- None detected. Application receives data from external services but doesn't trigger callbacks

**IPC Events (Electron Internal):**
- docker:* (pull-progress, status-update, install-progress, log, update-available)
- webview:* (visibility-changed, did-navigate, did-finish-load, load-failed)
- notifications:* (changed)
- aws-auth:* (various auth flows)
- keystore:* (mnemonic operations)
- network-guard:* (network blocking telemetry)

## Network Security

**Network Guard:**
- Implementation: `src/main/network-guard.ts`
- Feature: Blocks external network requests from webview
- Logged requests: `BlockedRequest[]` interface with URL, timestamp, method, source
- API: `window.electronAPI.networkGuard.getBlockedRequests()`

**Port Management:**
- Required ports: 3000 (UI), 5432 (DB), 8000 (API)
- Port availability checked before starting services
- Conflict detection and process killing available via `docker:kill-port-processes` IPC

---

*Integration audit: 2026-03-26*
