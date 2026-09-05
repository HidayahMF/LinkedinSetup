# LinkedIn AI Agent

A user-controlled AI assistant for managing, reviewing, improving, and executing **approved** LinkedIn profile and content changes.

> User controls the truth. AI controls the suggestions. Executor controls the actions.
> Nothing reaches LinkedIn without user approval.

The complete behavioral, security, approval, and architecture contract lives in [`flow.md`](./flow.md).
**Every developer and coding agent must read `flow.md` before modifying this project.**

## Status

Phases 1–8 of `flow.md` §92 are implemented (foundation, source of truth, profile
editor, AI reviewer/improver via local provider, diff + versioning, approval
system, agent orchestration), plus posts and audit logging. The LinkedIn executor
exists as a **hardened execution pipeline with a simulation backend** — see below.

**Executor: SIMULATION (default) or REAL PLAYWRIGHT (opt-in).** The default
`AUTOMATION_PROVIDER=simulation` honestly reports every action as `UNVERIFIED`
(flow.md §56 — never fake `SUCCESS`). Setting `AUTOMATION_PROVIDER=playwright`
activates the real Chromium executor behind `LINKEDIN_BROWSER_PROFILE_PATH`;
it fails closed on missing configuration and NEVER silently falls back to
simulation on browser failure.

Implemented:

- Real authentication: register/login, scrypt-hashed passwords, opaque bearer
  session tokens (SHA-256 hashed at rest, expiring), verified request identity
- Source-of-truth store (`profile_facts`) with fact taxonomy & confidence status
- Profile editor with versioned history (no overwrites) + rollback
- AI reviewer (`/api/profile/review`, local rule-based provider)
- AI improver → proposals → fact validation (`SUPPORTED / UNSUPPORTED /
  NEEDS_CONFIRMATION`) gating `READY`
- Diff view, user edits create new versions and invalidate old approvals
- Structured approval system: contentHash binding, expiry, partial approval scope
- Action queue + Final Execution Contract (21 AND-connected checks)
- Protected state machine (proposal/action/post transition tables)
- Append-only audit logging
- Agent orchestration (intent detection, command pipeline, sessions)
- Posts lifecycle up to publish confirmation (CRITICAL risk path enforced)
- React dashboard: agent chat, facts, profile, review, versions, approvals,
  queue, logs, settings

## Architecture

```text
USER → AI ANALYSIS → PROPOSAL → FACT VALIDATION → USER REVIEW
     → USER EDIT → USER APPROVAL → APPROVED ACTION
     → BACKEND VALIDATION (21-check contract) → AUTOMATION PROVIDER
     → LINKEDIN* → READ-BACK VERIFICATION → AUDIT LOG
```

`*` With the simulation provider nothing external is touched and results stay
`UNVERIFIED`. With the playwright provider the approved payload is executed in a
persistent Chromium profile; every write is read back from LinkedIn and compared
against the approved payload — any mismatch is `UNVERIFIED`, navigation/selector
failure is `FAILED`, and CAPTCHA/2FA/login challenges immediately pause as
`SECURITY_CHALLENGE` (never bypassed, no retry loops). There is never a direct
AI → LinkedIn path. See `flow.md` for the full contract (state machine,
execution gate, zero-hallucination policy, audit rules).

### Authentication

```text
request → authentication verification (bearer token → auth_sessions)
        → authenticated user  (identity NEVER taken from headers/body)
        → authorization       (ownership enforced in every service call)
        → route/controller    → domain operation
```

- Passwords: scrypt hash only (never plaintext, never logged, never returned)
- Sessions: random 256-bit tokens; only their SHA-256 digest is stored;
  TTL via `AUTH_SESSION_TTL_HOURS`; logout/expiry invalidates immediately
- Legacy `x-user-id` header trust has been removed entirely
- Regression tests: AUTH-01…AUTH-08 (forgery, unauthenticated access,
  cross-user read/write/execute/approve isolation, expiry, context integrity)

### Transport & API hardening

- Auth rate limiting: login 10 / 15 min and register 50 / hour per client IP,
  in-memory fixed-window buckets (`429` + `Retry-After`; state is process-local)
- CORS allowlist via `CORS_ORIGINS` — no wildcard; requests without an Origin
  header (curl, tests, Vite dev proxy) pass through; Bearer-only, no cookies
- Security headers on every response: `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, restrictive API CSP
- Request body capped at 1 MB → `413 PAYLOAD_TOO_LARGE`
- All internal log lines pass through a secret-redaction helper; error
  responses use a fixed safe shape with no stack traces or connection strings

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express.js |
| Database | MongoDB (+ Mongoose) |
| Validation | Zod |
| Password hashing | Node crypto (scrypt) — no external dependency |
| Browser automation | Playwright (Chromium, persistent profile) — executor layer only |
| Testing | Vitest |
| Package manager | npm (workspaces) |

Playwright is confined to `backend/src/infrastructure/automation/` and is
enforced there by a repo-level guardrail test; it is never a dependency of the
AI or route layers.

## Browser session & credentials

- The LinkedIn session lives ONLY inside the Playwright process, in the
  persistent profile directory given by `LINKEDIN_BROWSER_PROFILE_PATH`
  (`flow.md` §80.1). No passwords, cookies, or session tokens are ever stored in
  MongoDB, returned by the API, written to logs, or exposed to the AI layer.
- No automatic login: if LinkedIn shows a login form, CAPTCHA, 2FA, or any
  security challenge, execution pauses with `SECURITY_CHALLENGE` and you take
  over in the visible browser window (`LINKEDIN_HEADLESS=false`).
- Selectors are deterministic, code-reviewed candidate lists — no AI-supplied
  or runtime-generated selectors. Selector failure fails closed as `FAILED`.
- Browser actions currently implemented by the real executor:
  `update_headline`, `update_about`, post publish paths. All other action types
  fail closed with `EXECUTION_ERROR` until their browser flows are implemented.

## Project structure

```text
/
├── flow.md              # architectural & behavioral contract (do not edit casually)
├── package.json         # root workspace scripts
├── .env.example
├── tests/               # repo-level security/contract guardrail tests
│   └── security/
├── frontend/
│   └── src/
│       ├── components/    # Layout, DiffView, fact/badges
│       ├── pages/         # Login, Dashboard, Agent, Facts, Profile, Review,
│       │                  # Versions, Approvals, Queue, Logs, Posts, Settings
│       ├── services/      # api (bearer token), auth, workflow, profileFacts
│       └── types/
└── backend/
    ├── src/
    │   ├── config/          # zod-validated environment loading
    │   ├── database/        # MongoDB connection infrastructure
    │   ├── middleware/      # error handling
    │   ├── routes/          # auth, health, profile-facts, profile, versions,
    │   │                    # proposals, approvals, linkedin, posts, agent, logs, reviews
    │   ├── security/        # authContext (session verification), password, tokens
    │   ├── domain/
    │   │   ├── users/         # accounts (scrypt hashes)
    │   │   ├── auth/          # auth_sessions + login/logout/register service
    │   │   ├── profile-facts/ # source of truth
    │   │   ├── profile/       # profile editor + schema
    │   │   ├── versions/      # append-only version history
    │   │   ├── proposal/      # AI proposals + fact validation state
    │   │   ├── approval/      # structured approvals (contentHash, expiry, scope)
    │   │   ├── review/        # ai_reviews
    │   │   ├── posts/         # post lifecycle
    │   │   └── sessions/      # agent conversation sessions/commands
    │   ├── agent/           # orchestrator, intents, planner, reviewer, improver,
    │   │                    # providers (local | openai_compatible)
    │   ├── execution/       # actionPlanner, actionTypes (risk matrix),
    │   │                    # executorController (21-check contract), provider (simulation)
    │   ├── state-machine/   # protected proposal/action/post transitions
    │   ├── audit/           # append-only audit log
    │   ├── errors/          # ApiError taxonomy
    │   └── server.ts / app.ts
    └── test/                # vitest suites incl. T-01…T-22 + AUTH-01…AUTH-08
```

## Environment

Copy `.env.example` to `.env` and adjust values:

```text
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DATABASE=linkedin_ai_agent
AI_PROVIDER=local
AI_API_KEY=
AI_MODEL=gpt-4o-mini
AUTH_SESSION_TTL_HOURS=24
CORS_ORIGINS=http://localhost:5173
AUTOMATION_PROVIDER=simulation
# Required when AUTOMATION_PROVIDER=playwright (fails closed if missing):
LINKEDIN_BROWSER_PROFILE_PATH=./.linkedin-profile
LINKEDIN_HEADLESS=false
```

Never commit `.env`. Never store LinkedIn credentials here — the browser session
lives exclusively inside the Playwright executor process (`flow.md` §80.1).

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

The first screen is the login/register page; every account gets an isolated
workspace (facts, proposals, approvals, actions are strictly per-user).

## Tests

```bash
npm test               # backend (120) + frontend (6) + security guardrails (5)
npm run test:backend   # incl. T-01…T-22 + AUTH-01…AUTH-08 + Phase C + Phase D suites
npm run test:frontend
npm run test:security  # repo-level contract guardrails
npm run typecheck      # tsc --noEmit for both packages
npm run build          # backend dist + frontend dist
```

Phase D regression suite (`phaseDExecutor.test.ts`, D-01…D-20) never touches the
real LinkedIn — provider logic is exercised through injected fake browser drivers
and the deterministic stub module; real-LinkedIn interaction is a manual smoke
test only (see below).

## Manual smoke test (real LinkedIn — only after all automated tests pass)

1. Set `AUTOMATION_PROVIDER=playwright` and `LINKEDIN_BROWSER_PROFILE_PATH`,
   keep `LINKEDIN_HEADLESS=false`, and sign in to LinkedIn once manually in the
   opened browser so the persistent profile holds the session.
2. Create a proposal → review → approve → verify the structured approval +
   contentHash.
3. Execute one LOW/MEDIUM-risk action first (e.g. headline). Read back the
   change on LinkedIn, confirm `COMPLETED`, and check the audit log.
4. Confirm no credentials/cookies/session tokens appear in logs or API traffic.
   Do NOT start with publishing posts.

## Rules of engagement

1. Read `flow.md` first.
2. No new LinkedIn automation or execution capability until explicitly requested;
   the executor must remain behind the approval gate and the 21-check contract.
3. No approval bypass helpers (`execute`, `forceExecute`, `bypassApproval`,
   etc.) — guarded by automated tests in `tests/security/`.
4. Do not reintroduce header-based identity (`x-user-id`); identity comes only
   from verified session.
