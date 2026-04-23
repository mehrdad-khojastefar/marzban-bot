# Architecture

## System Overview

Three interfaces sharing a single core:

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   Telegram Bot  │   │   Admin Panel   │   │      CLI        │
│   (Telegraf.js) │   │   (Next.js)     │   │  (Commander.js) │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                      │
         └─────────────────────┼──────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │     Shared Core     │
                    │  src/core/          │
                    │  ├── marzban/       │
                    │  ├── db/            │
                    │  └── utils/         │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼──────┐  ┌──────▼──────┐  ┌─────▼──────┐
    │  Marzban Panel │  │  PostgreSQL  │  │  Telegram  │
    │  (Xray/VPN)    │  │  (Prisma)   │  │  API       │
    └────────────────┘  └─────────────┘  └────────────┘
```

## Core Layer (`src/core/`)

The core is the only place allowed to talk to external systems. The bot, panel, and CLI import from core — never from each other.

### `src/core/marzban/` — Marzban API Client

**Responsibility:** Thin typed wrapper over the Marzban REST API. No business logic here — just HTTP calls and type safety.

**Key decisions:**

| Decision | Choice | Reason |
|---|---|---|
| HTTP client | Axios | Built-in interceptors simplify auth retry; better error handling than native fetch |
| Auth strategy | Lazy token fetch + in-flight deduplication | Token is fetched on first request, not at startup. Prevents startup failures if Marzban is temporarily down |
| Singleton | Module-level instance via `initMarzban()` / `getMarzban()` | One connection, one token. Class not exported — callers can't accidentally create multiple instances |
| Key casing | Snake_case (mirrors API) | No silent transformation — what the API returns is what you get |
| Error type | `MarzbanError extends Error` with `statusCode` | Allows `instanceof` checks and status-based branching in callers |
| 401 handling | One retry after re-auth, then throw | Handles token expiry transparently; hard fails on bad credentials |

**File layout:**
```
src/core/marzban/
├── types.ts          # All TypeScript interfaces and unions (mirrors OpenAPI schemas)
├── errors.ts         # MarzbanError class + isMarzbanError() type guard
├── client.ts         # MarzbanClient class (private — not exported from index)
├── singleton.ts      # initMarzban() / getMarzban() + module-level instance
└── index.ts          # Public barrel — types, errors, singleton helpers only
```

**Auth flow:**
```
First request
     │
     ▼
ensureToken()
     │
     ├── token cached? ──yes──► inject Bearer header ──► send request
     │
     └── no ──► tokenFetchPromise set? ──yes──► await it (dedup)
                     │
                     no
                     │
                     ▼
              POST /api/admin/token (form-urlencoded)
                     │
                     ▼
              store token ──► inject Bearer header ──► send request
                                                            │
                                                     401 response?
                                                            │
                                                    yes (first time)
                                                            │
                                                    invalidate token
                                                            │
                                                    re-auth + retry once
                                                            │
                                                    401 again? ──► throw MarzbanError(401)
```

**Array query param serialization:**

The Marzban API (FastAPI) expects repeated keys for list params, not comma-separated:
```
/api/users?username=alice&username=bob   ✓
/api/users?username=alice,bob            ✗
```

Axios handles this with `paramsSerializer` using `qs` or manual `URLSearchParams` with repeated `append()` calls.

### `src/core/db/` — Database Layer

- ORM: Prisma
- Database: PostgreSQL
- Schema defined in `prisma/schema.prisma`
- Prisma client accessed as a singleton (same pattern as Marzban client)

### `src/core/utils/` — Shared Utilities

Formatters, date helpers, and other stateless functions shared across bot/panel/CLI.

---

## Bot Layer (`src/bot/`)

- Framework: Telegraf.js
- Pattern: Scene-based navigation (Telegraf Scenes/Wizards)
- Each feature is a scene (e.g., `createUserScene`, `renewScene`)
- Handlers respond to commands and callbacks
- Middlewares handle auth, rate limiting, logging

## Panel Layer (`src/panel/`)

- Framework: Next.js 14 (App Router)
- Auth: Admin-only, session-based
- Communicates with core via direct imports (not HTTP)

## CLI Layer (`src/cli/`)

- Framework: Commander.js
- Admin tasks: seed, migrate, manage admins
- Communicates with core via direct imports

---

## Environment

All configuration via environment variables. Validated at startup — missing required vars throw immediately.

```
DATABASE_URL         PostgreSQL connection string
TELEGRAM_BOT_TOKEN   Telegraf bot token
MARZBAN_API_URL      Base URL of the Marzban panel
MARZBAN_ADMIN_TOKEN  Marzban admin credentials (or username/password pair)
ADMIN_SECRET         Secret for CLI admin operations
```

---

## Error Strategy

- **Marzban errors:** `MarzbanError` with `statusCode`. Callers branch on status (404 = not found, 409 = conflict, etc.)
- **Database errors:** Prisma errors caught and mapped to domain errors in the core layer
- **Bot errors:** Telegraf middleware catches unhandled errors, logs them, sends user-friendly message
- **Validation:** Zod schemas at system boundaries (incoming bot input, CLI args)

---

## Testing

| Layer | Tool | Strategy |
|---|---|---|
| `core/marzban` | Vitest | Mock axios with `vi.spyOn(axios, 'request')` or axios-mock-adapter |
| `core/db` | Vitest | Test DB (separate DATABASE_URL in .env.test) |
| Bot handlers | Vitest | Mock core services, test handler logic |
| CLI commands | Vitest | Mock core services, test output |

Pre-commit: `vitest run` must pass before every commit (enforced via Husky + lint-staged).

---

## Commit Convention

```
feat(cli|bot|panel|core): description
fix(cli|bot|panel|core): description
chore: description
```

One feature = up to 3 commits: `core` → `bot` → `panel`.
