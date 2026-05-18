# RECAP — Step 1: DB Indexes

## What changed
Call `initSettingService(db)` at the top of `startPremzyServer` so the premzy callback process can read the `events_enabled` setting. Without this, every `logEvent` call inside the premzy server threw `"Setting service not initialized"` inside `getSetting('events_enabled')`, the error was swallowed by the fire-and-forget `.catch` in `logEvent`, and every premzy webhook event was silently dropped.

## Key decisions
- **Initialize once at server start, not per request:** the setting service is process-global state, same pattern the bot process uses. Re-initializing per request would invalidate the 30s cache for nothing.
- **Use the same `db` that the rest of the server already constructed:** premzy already builds a `PrismaClient` for provisioning — reuse it instead of opening a second pool just for settings.

## Files changed
```
src/premzy/server.ts    # initSettingService(db) right after PrismaClient construction
```

## Verification
- `npx tsc --noEmit -p tsconfig.bot.json`: no new TS errors in `src/premzy/server.ts` (pre-existing errors elsewhere unchanged).
- The fix is a one-call wiring change; no test changes needed — the setting service already has its own unit coverage.
- `prisma/schema.prisma`: added `@@index` directives for the hottest query columns.
  - `Account`: `(user_id)`, `(seller_id)`, `(marzban_username)`, `(marzban_sub_token)`, `(expires_at)`, `(seller_id, payment_status)`
  - `User`: `(status)`
  - `Payment`: `(user_id)`, `(status)`, `(user_id, status)`
  - `Transaction`: `(user_id)`, `(account_id)`, `(user_id, status)`
- New migration `prisma/migrations/20260518000000_add_performance_indexes/migration.sql` with idempotent `CREATE INDEX IF NOT EXISTS` statements.
- `ARCHITECTURE.md`: added a "Performance & Scalability → Index policy" section documenting the rule and baseline.

## Why
Postgres does not auto-index foreign keys, and the prior schema had only two indexes (`Transaction.status`, `Transaction.premzy_order_id`). Every other hot query path full-table-scans at 10K rows — sub-server token lookup, admin pending-approval queue, seller report aggregates, per-user account list. Adding these indexes is the single biggest p95 win available and is fully reversible.

## Decisions
- **Index columns used in WHERE / ORDER BY / joins, including FKs.** This is now an explicit policy in `ARCHITECTURE.md`.
- **Idempotent migration SQL** (`CREATE INDEX IF NOT EXISTS`) matches the project's existing convention (see `20260508093043_drift_cleanup`). Safe to re-run.
- **No `CONCURRENTLY`.** Tables are small enough (< 10K rows) that a normal index build is sub-second; `CONCURRENTLY` is awkward inside Prisma migrate transactions and would complicate this PR.
- **No new unique constraints** on `marzban_username` / `marzban_sub_token` yet — those are arguably correct but they're a separate, riskier change (data may already have duplicates from past bugs). Deferred.

## Verification
- `yarn db:generate` — Prisma schema parses, client regenerated.
- `yarn test` — 105/105 pass.
- `yarn lint` — pre-existing failures on `main` only; this PR touches no `.ts` files.

## What's next
Step 2 in `WORKING.md`: Prisma connection pool sizing + slow-query logging.
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
