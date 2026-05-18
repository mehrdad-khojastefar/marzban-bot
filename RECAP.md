# RECAP — Step 2: Prisma pool sizing + slow-query logging

## What changed
- `src/core/db/client.ts`: new `createPrismaClient(options)` factory that configures:
  - `pg` pool: `max` (default 25) and `idleTimeoutMillis` (default 30 s), passed through `PrismaPg`.
  - Prisma event logging: `query`, `warn`, `error` emitted as events; queries ≥ `DB_SLOW_QUERY_MS` (default 100 ms) are logged with the SQL text and **parameter count only** (params never logged — PII risk).
  - Tagged log prefix per process (`bot`, `sub`, `premzy`) so noisy operators can grep.
- `initDb` / `getDb` keep their old signature (still accept a URL string) and delegate to the factory.
- `src/sub/server.ts` and `src/premzy/server.ts` no longer construct `PrismaPg` + `PrismaClient` inline — they call `createPrismaClient` with a `source` tag.
- `.env.example`: documented `DB_POOL_MAX`, `DB_POOL_IDLE_MS`, `DB_SLOW_QUERY_MS`.
- `ARCHITECTURE.md`: added a "Database client factory" subsection under Performance & Scalability.
- Tests: extended `src/core/db/__tests__/singleton.test.ts` to verify pool options flow through, env-var overrides work, log handlers register, and missing `DATABASE_URL` throws.

## Why
The Prisma + `@prisma/adapter-pg` setup previously had **no** explicit pool sizing — `pg.Pool` defaults to a max of 10. With three processes (bot + sub + premzy) under load that's a hard ceiling, and slow queries were silently absorbed without any way to know which ones to fix first. Centralising client construction means future tuning (statement timeouts, query event sampling, etc.) lands in one place.

## Decisions
- **Factory-first, singleton second.** `createPrismaClient` is the primitive; `initDb` is a singleton wrapper used only by the bot. Sub/Premzy don't need the singleton, so they don't pay for it.
- **Per-process pool, not a shared one.** Each Node process has its own `pg.Pool`; we don't try to share connections across processes (would require PgBouncer). Operator sets `DB_POOL_MAX` per process if defaults don't fit.
- **Never log query params.** Parameters can contain `chat_id`, names, or tokens. We log the SQL text + param count, full stop.
- **Slow-query log goes through `console.warn` for now.** Step 10 (observability) swaps this for `pino` + Prometheus histograms. Keeping the surface small means Step 10 changes one place.

## Verification
- `yarn test` — 110/110 pass (4 new tests for the factory).
- `npx eslint src/core/db src/sub src/premzy` — no errors in touched files (2 pre-existing `any` warnings in `premzy/server.ts`).
- Pre-existing main-branch lint/tsc failures unrelated to this PR.

## What's next
Step 3 in `WORKING.md`: Marzban client hardening — keep-alive agents, proactive token refresh, per-call timeout, single retry on transient errors.
