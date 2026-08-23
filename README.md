# LinkedIn AI Agent

A user-controlled AI assistant for managing, reviewing, improving, and executing **approved** LinkedIn profile and content changes.

> User controls the truth. AI controls the suggestions. Executor controls the actions.
> Nothing reaches LinkedIn without user approval.

The complete behavioral, security, approval, and architecture contract lives in [`flow.md`](./flow.md).
**Every developer and coding agent must read `flow.md` before modifying this project.**

## Status

**Phase 1 — Foundation only.**

Implemented:

- Monorepo workspace (npm workspaces)
- React + TypeScript + Vite + Tailwind CSS frontend shell
- Node.js + TypeScript + Express backend with `/health`
- MongoDB connection infrastructure (Mongoose, no business schemas)
- Zod validation foundation
- Vitest test setup (backend / frontend / root security guardrails)

Not implemented yet (per `flow.md` §92 phases): profile editor, AI reviewer,
AI improver, diff/versioning, approval system, agent orchestration, LinkedIn
executor (Playwright), posts.

## Architecture (target)

```text
USER → AI ANALYSIS → PROPOSAL → FACT VALIDATION → USER REVIEW
     → USER EDIT → USER APPROVAL → APPROVED ACTION
     → BACKEND VALIDATION → PLAYWRIGHT EXECUTOR → LINKEDIN
     → VERIFICATION → AUDIT LOG
```

There is never a direct AI → LinkedIn path. See `flow.md` for the full contract
(state machine, execution gate, zero-hallucination policy, audit rules).

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express.js |
| Database | MongoDB (+ Mongoose) |
| Validation | Zod |
| Testing | Vitest |
| Package manager | npm (workspaces) |

## Project structure

```text
/
├── flow.md              # architectural & behavioral contract (do not edit casually)
├── package.json         # root workspace scripts
├── .env.example
├── tests/               # cross-cutting security/contract guardrail tests
│   └── security/
├── frontend/
│   └── src/             # components/pages/features/services/hooks/types/lib
└── backend/
    └── src/
        ├── config/          # environment loading (zod-validated)
        ├── database/        # MongoDB connection infrastructure
        ├── middleware/      # error handling foundation
        ├── routes/          # health endpoint
        ├── validation/      # generic zod validation helper
        ├── domain/          # (future) business domain
        ├── proposal/        # (future) proposal system
        ├── approval/        # (future) approval system
        ├── authorization/   # (future) authorization boundary
        ├── execution/       # (future) execution boundary
        ├── state-machine/   # (future) protected state machine
        ├── audit/           # (future) append-only audit logging
        ├── security/        # (future) security boundaries
        └── server.ts        # entry point
```

## Environment

Copy `.env.example` to `.env` and adjust values:

```text
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DATABASE=linkedin_ai_agent
```

Never commit `.env`. The backend starts without a database; if `MONGODB_URI`
is set it will try to connect and log a warning if MongoDB is unreachable.

## Install

```bash
npm install
```

## Run backend

```bash
npm run dev -w backend
# http://localhost:3000/health → {"status":"ok"}
```

## Run frontend

```bash
npm run dev -w frontend
# http://localhost:5173
```

Run both at once:

```bash
npm run dev
```

## Tests

```bash
npm test               # backend + frontend + security guardrails
npm run test:backend
npm run test:frontend
npm run test:security  # repo-level contract guardrails
npm run typecheck      # tsc --noEmit for both packages
npm run build          # backend dist + frontend dist
```

## Rules of engagement

1. Read `flow.md` first.
2. No LinkedIn automation, AI integration, or execution code until the
   corresponding phase is explicitly requested.
3. No approval bypass helpers (`execute`, `forceExecute`, `bypassApproval`,
   etc.) — guarded by automated tests in `tests/security/`.
