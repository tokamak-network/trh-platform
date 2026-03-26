# Technology Stack

**Analysis Date:** 2026-03-26

## Languages

**Primary:**
- TypeScript 5.x - All source files and configuration
- JavaScript (ES2017) - Build and configuration scripts

**Secondary:**
- CSS/Tailwind CSS - Styling system

## Runtime

**Environment:**
- Node.js 22-alpine (Docker image: `node:22-alpine`)
- Next.js 15.5.9

**Package Manager:**
- npm (primary)
- yarn (lockfile present)
- Lockfile: `package-lock.json` and `yarn.lock` present

## Frameworks

**Core:**
- Next.js 15.5.9 - React meta-framework with App Router, server-side rendering, API routes
- React 19.2.3 - UI library with hooks and context API

**UI/Component System:**
- Radix UI (component suite: alert-dialog, avatar, checkbox, dialog, dropdown-menu, label, progress, select, separator, slot, switch, tabs, toggle, tooltip)
- shadcn/ui - Component composition system (configured at `components.json`)
- Tailwind CSS 4.x - Utility-first CSS framework
- Lucide React 0.525.0 - Icon library

**Forms & Validation:**
- React Hook Form 7.60.0 - Form state management
- @hookform/resolvers 5.1.1 - Form validation integration
- Zod 4.0.5 - Runtime schema validation and type inference

**Data Fetching & State:**
- @tanstack/react-query 5.90.12 - Server state management
- @tanstack/react-query-devtools 5.90.12 - Development tools for React Query
- Axios 1.10.0 - HTTP client for API calls

**Utilities:**
- Ethers 6.x - Blockchain interaction (Web3 library)
- bip39 3.1.0 - BIP39 mnemonic generation for wallets
- class-variance-authority 0.7.1 - CSS class composition
- clsx 2.1.1 - Utility for conditional class names
- tailwind-merge 3.3.1 - Merge Tailwind CSS classes intelligently
- next-runtime-env 3.3.0 - Runtime environment variable injection

**Notifications:**
- react-hot-toast 2.5.2 - Toast notification system

## Build & Development

**Bundler:**
- Next.js built-in (Webpack-based)

**Development:**
- Node.js 22-alpine
- BUILDPLATFORM-aware Dockerfile (supports native builds on different architectures)

**Configuration Tools:**
- TypeScript 5.x - Type checking
- ESLint 9.x with Next.js config - Code linting
- Tailwind CSS 4.x - CSS framework

## Key Dependencies

**Critical:**
- next (15.5.9) - Full-stack React framework with App Router and middleware
- react & react-dom (19.2.3) - UI rendering engine
- axios (1.10.0) - HTTP client for backend API communication with interceptors
- @tanstack/react-query (5.90.12) - Server state management with caching, retry logic, and devtools
- zod (4.0.5) - TypeScript-first schema validation for runtime type safety

**Infrastructure:**
- next-runtime-env (3.3.0) - Exposes environment variables at runtime (critical for Docker deployments)
- ethers (6.x) - Blockchain library for wallet integration and RPC interactions
- react-hook-form (7.60.0) - Efficient form handling with minimal re-renders
- @radix-ui (multiple packages) - Unstyled, accessible component primitives

**UI/Styling:**
- tailwindcss (4.x) - Utility-first CSS with PostCSS integration
- @tailwindcss/postcss (4.x) - Tailwind PostCSS plugin
- lucide-react (0.525.0) - Consistent icon library
- tw-animate-css (1.3.5) - Animation utilities for Tailwind

## Configuration

**Environment:**
- `.env.example` - Template with `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
- Environment variables set at runtime via `next-runtime-env` (PublicEnvScript)
- Two environment contexts:
  - **Development:** `NEXT_PUBLIC_API_BASE_URL` (client-visible, set locally)
  - **Docker:** `API_SERVER_URL` (server-side, set in Dockerfile to `http://backend:8000`)

**Build Configuration:**
- `tsconfig.json` - TypeScript strict mode enabled, path alias `@/*` for `./src/*`
- `eslint.config.mjs` - ESLint 9 flat config with Next.js core-web-vitals and TypeScript rules
- `next.config.ts` - Minimal Next.js config (empty object)
- `postcss.config.mjs` - PostCSS with Tailwind CSS plugin
- `components.json` - shadcn/ui configuration (New York style, RSC mode, Tailwind, Lucide icons)

**Dev Tools:**
- No explicit Prettier config; uses ESLint defaults
- Next.js built-in code splitting and optimization

## Platform Requirements

**Development:**
- Node.js 22.x
- Docker (for containerized testing)
- TypeScript knowledge for source code
- npm or yarn for dependency management

**Production:**
- Node.js 22-alpine container
- Backend service at `http://backend:8000` (Docker) or `http://localhost:8000` (local)
- Database: PostgreSQL (managed by backend)
- Environment variable injection at container startup

## Docker Deployment

**Build Stage:**
- Uses `node:22-alpine` as builder platform
- Multi-stage build: builder → production
- Installs dependencies: `npm install`
- Builds Next.js app: `npm run build`
- Copies built artifacts to production image

**Runtime:**
- Base image: `node:22-alpine`
- Workdir: `/app`
- Exposed port: 3000
- Runtime env: `API_SERVER_URL=http://backend:8000` (set at container start)
- Start command: `npm run start` (Next.js production server)

**Architecture Support:**
- `--platform=$BUILDPLATFORM` in builder stage enables native architecture builds
- Avoids QEMU SIGILL errors with Node.js worker threads on ARM

---

*Stack analysis: 2026-03-26*
