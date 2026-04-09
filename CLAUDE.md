# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project Overview

**TRH Platform** — Electron desktop app. Runs PostgreSQL + Node.js backend + Next.js frontend locally via Docker Compose.

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- PostgreSQL: localhost:5432 (postgres/postgres)
- Default admin: admin@gmail.com / admin

## Key Commands

```bash
make setup       # Initial setup: generate config + run docker compose + init backend
make up          # Start all services
make down        # Stop containers (with confirmation)
make clean       # Stop + delete volumes
make status      # Check container status
make logs        # Stream logs
make update      # Pull latest images + restart
make config      # Interactive environment configuration
```

## Config Files

| File | Purpose |
|------|---------|
| `config/.env.docker` | Docker image overrides (empty by default; uses `:latest` tag) |
| `config/.env.backend` | PostgreSQL, JWT, default admin credentials |
| `config/.env.frontend` | `NEXT_PUBLIC_API_BASE_URL` |

Templates at `config/*.template`. Generated via `make config` or `make setup`.

## Electron App Build & Run

### Development

```bash
npm install       # Install dependencies
npm run dev       # Run in development mode (Electron + Vite)
npm run build     # Compile TypeScript only (outputs to dist/)
```

> Do NOT use Vite dev server alone — always use `ELECTRON_USE_BUILD=1` or `npm run dev` for Electron testing.

### Packaging (Release Builds)

```bash
npm run package        # Current platform
npm run package:mac    # macOS (.dmg)
npm run package:win    # Windows (.exe) — requires icon.ico
npm run package:linux  # Linux (.AppImage)
```

Output: `release/` directory.

### Required Docker Images

Must be available locally before running:

| Image | Source |
|-------|--------|
| `tokamaknetwork/trh-backend:latest` | Docker Hub (tokamak-network/trh-backend) |
| `tokamaknetwork/trh-platform-ui:latest` | Docker Hub (tokamak-network/trh-platform-ui) |
| `postgres:15` | Docker Hub |

## Troubleshooting

- Service start failure → `make logs`, check Docker is running
- DB connection failure → check PostgreSQL credentials in `config/.env.backend`
- Frontend → backend connection failure → check `NEXT_PUBLIC_API_BASE_URL` in `config/.env.frontend`

## Git Workflow

- Conventional Commits format
- Branches: `feature/xxx`, `fix/xxx`, `test/xxx`
- `main` = production release branch

## Workflow

- **Planning needed**: `/gsd:discuss-phase`
- **Bug fix**: `/gsd:debug`
- **Feature implementation**: `/gsd:execute-phase`
- **Before marking done**: `/gsd:verify-work`

### Wiki Update Conditions

New component/concept/interface, design decision (Why), troubleshooting solution, or conflict with existing wiki → ingest to `trh-wiki`:
1. Create/update `wiki/` page
2. Add entry to `wiki/log.md`
3. commit + push

## GSD Workflow Rules

Start with a GSD command before modifying files:
- `/gsd:quick` — small fixes, docs
- `/gsd:debug` — bug investigation
- `/gsd:execute-phase` — planned phase work

## Reference Docs

@docs/claude/conventions.md
@docs/claude/architecture.md
@docs/claude/crosstrade-stack.md

## Skill Routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
- Playwright, e2e, spec, electron test → invoke playwright-e2e-trh
