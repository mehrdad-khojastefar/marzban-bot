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
