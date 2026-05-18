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
# RECAP — Step 3: Marzban client hardening

## What changed
- `src/core/marzban/client.ts`:
  - **HTTP keep-alive** — `http.Agent` and `https.Agent` with `keepAlive: true` and a configurable `maxSockets` (default 50) on the shared axios instance. New TCP connections were being opened per call.
  - **Per-request timeout** — default 8 s (configurable via `MarzbanClientConfig.timeoutMs`). Previously: none, so a hung Marzban instance could pin a Node task indefinitely.
  - **Proactive token refresh** — track `tokenIssuedAt`; refresh when 80% of the TTL has elapsed. TTL is taken from the OAuth2 `expires_in` field when present, otherwise falls back to 30 min (`tokenTtlMs` config or default). Previously: token was cached until a 401 forced a refresh.
  - **Transient retry** — one retry on network errors or 5xx with a small fixed delay (`retryDelayMs`, default 250 ms). 4xx still fails immediately. The existing 401 → token-refresh path is preserved as a separate retry flag so a request can still be retried once for auth *and* once for transient errors.
  - The 401 retry now invalidates token + issued-at + the in-flight fetch promise as a single `invalidateToken()` helper.
- `src/core/marzban/types.ts`: `Token.expires_in?: number` added, and `MarzbanClientConfig` gains four optional knobs (`timeoutMs`, `keepAliveMaxSockets`, `retryDelayMs`, `tokenTtlMs`).
- New tests:
  - `src/core/marzban/__tests__/transientRetry.test.ts` — 5xx and network-error retries succeed; 4xx does not retry; retry-once is honored; 401 stays on the auth path, not the transient path.
  - `src/core/marzban/__tests__/tokenExpiry.test.ts` — token reused before 80% TTL; refreshed after; server-provided `expires_in` overrides the default.
- `CLAUDE.md`: added a "Performance Standards" section codifying the project-wide perf rules (indexing, `select` discipline, DB factory usage, Marzban client usage, no-PII logging).

## Why
Each Marzban call previously paid for a fresh TCP connection (no keep-alive) and could hang forever (no timeout). Tokens were only refreshed on a 401 — meaning every long-lived process eventually paid for a synchronous round-trip mid-flow. There was no recovery from transient 5xx or network blips. At 10K-user load these compound into avoidable p95 spikes.

## Decisions
- **One transient retry, not exponential backoff.** A 250 ms delay is enough to ride out a brief blip; multiple retries would just stack latency for users when Marzban is genuinely down. If we ever need more we can switch to a small bounded backoff.
- **Separate flags** for `_retriedAuth` and `_retriedTransient`. A request can be retried once for each cause — that's intentional, since the two failure modes are orthogonal.
- **Token TTL is server-driven, with a defensive fallback.** We read `expires_in` from the OAuth response (RFC 6749) and only fall back to 30 min if it's missing.
- **No circuit breaker yet.** WORKING.md explicitly defers this until we measure. Simpler is better.

## Verification
- `yarn test` — 112/112 pass (7 new tests: 5 retry, 2 token expiry).
- `npx eslint src/core/marzban` — clean.
- Pre-existing main-branch tsc errors (Telegraf typings, socks-proxy-agent module resolution) unrelated to this PR.

## What's next
Step 4 in `WORKING.md`: remove the N+1 `findUnique` chain in `adminViewAccount.ts` by caching the viewed account in `ctx.session`.
# RECAP — Step 4: kill the N+1 in adminViewAccount

## What changed
- `src/bot/context.ts`: new `ViewedAccountCache` interface and `viewedAccount?` field on `SessionData`. The cache holds the slim subset of fields the action handlers actually need (id, marzban_username, payment_status, seller_id, seller_plan_id).
- `src/bot/scenes/adminViewAccount.ts`:
  - New exported helpers `ensureViewedAccount(ctx, db)` and `clearViewedAccount(ctx)`.
  - `renderDetail` continues to do its rich fetch (it needs `seller_plan` and `seller.user` for display) but now also populates the slim cache.
  - The action handlers `switch_plan_X`, `reset_usage`, `disable_account`, `enable_account`, `toggle_payment`, and `confirm_delete` no longer re-query the account via `findUnique` — they read from `ctx.session.viewedAccount`.
  - `back_accounts` and `confirm_delete` clear the cache to avoid stale data on re-entry.
  - The `switch_plan_X` handler also parallelises its remaining `sellerPlan.findUnique` with the cache lookup via `Promise.all`.
- New tests `src/bot/scenes/__tests__/adminViewAccountCache.test.ts` — 7 tests covering: null when no `selectedAccountId`, fetch + cache on first call, no DB calls on subsequent calls, refetch on id change, cache preservation when DB returns null, slim `select` shape, and `clearViewedAccount` behaviour.

## Why
The audit flagged 9 `db.account.findUnique` calls scattered across action handlers, most of them needed only `marzban_username` — a field that doesn't change during a viewing session. Per edit, that translated to ~3 DB roundtrips (enter render + handler refetch + post-mutation render) instead of 2. At 10K-user load with rapid button clicks, that compounds into avoidable p95 latency and pool pressure.

## Decisions
- **Cache slim, fetch rich on render.** The cache holds 5 small fields. The detail render keeps its rich include (it needs `seller_plan` + `seller.user`). Each action handler benefits from the cache; the render is unchanged.
- **Key on `selectedAccountId`.** If the admin selects a different account, the cache key mismatches and we refetch. The cache is also cleared on scene exit and on delete.
- **Two handlers still fetch.** `change_plan` and the text-input handler both need fresh `seller_plan` data for their calculations. They're rare paths and a legitimate fresh read. `change_plan` is now parallelised with the cache lookup.
- **No global cache, no TTL.** The cache lives in the per-session object so it can't leak across users, and the renderDetail call after every mutation guarantees freshness.

## Verification
- `yarn test` — 112/112 pass (7 new tests).
- `npx eslint src/bot/scenes/adminViewAccount.ts src/bot/scenes/__tests__/adminViewAccountCache.test.ts src/bot/context.ts` — clean.
- `grep -c "db.account.findUnique\\|db.account.update\\|db.account.delete" src/bot/scenes/adminViewAccount.ts` — was 16, now 11.

## What's next
Step 5 in `WORKING.md`: replace `findMany` + JS reduce with `aggregate` / `groupBy` in `sellerReport.ts` and `adminAccounts.ts`.
# RECAP — Step 5: server-side aggregation in seller / admin reports

## What changed
- `src/bot/scenes/sellerReport.ts`: replaced `findMany` + a JS for-loop with **one** `db.account.groupBy({ by: ['payment_status'], _sum: { price }, _count: { _all } })` plus a single `count` for active accounts. Total / paid / unpaid sums and counts are derived from the groupBy bucket; "active" uses a `where` clause on `expires_at > now`.
- `src/bot/scenes/adminAccounts.ts`: replaced the `findMany({ select: { price } }) + reduce` pattern with `db.account.aggregate({ _count: { _all }, _sum: { price } })`. Total count remains a separate `count` so the global total covers every account regardless of payment status.

## Why
Both files were pulling every matching row into Node just to sum a single column. For a seller with hundreds of accounts that's hundreds of `Account` rows materialized, serialized over the wire, and reduced in JS — every time the report renders. The fix is the textbook one: ask Postgres for the sum, get a single number back.

## Decisions
- **`groupBy` instead of two parallel aggregates** in seller report. Splitting the rows by `payment_status` lets us derive `total`, `paidAmount`, and `unpaidAmount` from one bucket scan rather than running an aggregate twice with different `where` clauses.
- **Keep a separate `count` for "active"** in seller report. `expires_at > now` is a dynamic predicate that doesn't fit into the static payment-status groupBy, and trying to express it as a CASE-style aggregate adds complexity for one number.
- **No new index** added in this PR. The Step 1 composite `(seller_id, payment_status)` already serves the seller groupBy. The admin `payment_status = 'unpaid'` filter doesn't hit a dedicated index yet (the composite needs `seller_id` as the leading column) — a single-column `@@index([payment_status])` would help, but the aggregate is still a big win without it. Filed for follow-up if monitoring shows it's hot.

## Verification
- `yarn test` — 105/105 pass (no test additions; the change is a mechanical query rewrite).
- `npx eslint src/bot/scenes/sellerReport.ts src/bot/scenes/adminAccounts.ts` — clean.
- Behaviour preserved by inspection: identical fields produced (`total`, `active`, `expired`, `totalAmount`, `paidAmount`, `remaining` / `totalAccounts`, `unpaidCount`, `totalDebt`).

## What's next
Step 6 in `WORKING.md`: `select` discipline across hot paths (`user`-by-`chat_id`, `plan`, `bot_messages`, `bot_settings`, sub-token lookup).
# RECAP — Step 6: select discipline on the hot paths

## What changed
- `src/bot/middlewares/channelCheck.ts`: `db.user.findUnique` now selects only `status` instead of hydrating the whole `User` row on every update.
- `src/bot/services/messageService.ts`: `db.botMessage.findMany` now selects `{ key, text }` only — skips `id` and `updated_at`.
- `src/bot/services/settingService.ts`: `db.botSetting.findMany` now selects `{ key, value }` only — skips `updated_at`.
- `src/sub/server.ts`: the per-request account lookup now uses `select` with a nested `seller.select.link_prefix` instead of `include: { seller: true }`. Down from a full Account + full Seller payload to three fields total.

## Why
These four sites run on **every** update / message / subscription request — they're the hottest reads in the whole app. Selecting columns explicitly cuts serialisation cost, network bytes, and downstream object hydration with no behaviour change. It also makes adding new columns to those tables safe (a new `BankCard.is_admin_only` column won't accidentally pile into the channel-check payload).

## Decisions
- **Scope kept tight.** This PR only touches the four highest-traffic per-update / per-request sites. Other call sites (admin scenes, seller scenes) are slower paths and can adopt `select` incrementally — the `Performance Standards` section in `CLAUDE.md` makes the rule explicit for new code.
- **No new abstractions.** I considered a `selectUserStatus`-style helper, but a literal `select: { ... }` per call site is more readable, lets each caller pick exactly what it needs, and shows up cleanly in code review.
- **Sub-server query is still `findFirst`.** `marzban_sub_token` isn't `@unique` at the schema level (potential legacy duplicates) so `findFirst` is the safe call. Step 1's index makes it cheap regardless.

## Verification
- `yarn test` — 105/105 pass. Existing mocks accept additional args, so adding `select` doesn't break them.
- `npx eslint src/bot/services src/bot/middlewares src/sub` — clean (one pre-existing `no-explicit-any` warning unrelated to this PR).
- Behaviour preserved by inspection — fields referenced downstream are all in the new `select` shape.

## What's next
Step 7 in `WORKING.md`: wrap buy/renew flows in `db.$transaction`, separate Marzban side-effects from DB tx, and add idempotency guards for terminal-state transactions.
# RECAP — Step 7: transactional buy / renew with idempotent claim

## What changed
- `src/core/provision.ts`:
  - New exported helpers `claimTransactionForProvisioning(db, transactionId)` (single-statement compare-and-swap that flips the Transaction to `provisioning` only if it is in a claimable state) and `markTransactionFailed(db, transactionId, err)` (best-effort failure recorder).
  - New exported error class `ProvisionConflictError` — thrown when a transaction cannot be claimed (already in flight, terminal, etc.). Carries `transactionId` and `currentStatus` so callers can render the right UI.
  - `provisionAccount` now: (1) claims the transaction, returning the existing result if already completed; (2) calls Marzban *outside* any DB transaction; (3) creates the Account and marks the Transaction `completed` in a single `db.$transaction(...)`. On Marzban failure: marks the transaction failed. On DB-write failure: best-effort removes the orphan Marzban user, then marks the transaction failed.
  - `renewAccount` mirrors the same lifecycle: claim → live read from Marzban → `modifyUser` (outside tx) → atomic `account.update + transaction.update` inside `db.$transaction(...)`.
- `src/bot/handlers/adminPayment.ts`: dropped the "update to provisioning" and "update to failed" calls from the handler — the provision functions own all state transitions now. The handler only stamps `reviewed_by` and renders the right UI on `ProvisionConflictError` ("already processed") vs other errors (retry button).
- `src/premzy/server.ts`: dropped the pre-flight status checks and the post-call `updateMany` failure handler — same reason. On `ProvisionConflictError` the Premzy callback returns a 200 with `already in state: <status>` so Premzy stops retrying.
- New tests `src/core/__tests__/provisionClaim.test.ts` — 10 tests covering: claim on pending, return `already_completed` on completed-with-account, throw on in-flight, throw on rejected, throw on completed-but-missing-account_id (inconsistent state), throw on not-found, claim-on-failed (retry-safe), and three `markTransactionFailed` cases.

## Why
The original code created the Marzban user, then created the Account row, then updated the Transaction — three separate writes with no atomicity. If the second or third write failed, we got: orphaned Marzban users, accounts without linked transactions, or transactions stuck in `provisioning`. Concurrent admin double-clicks could double-provision. WORKING.md flagged this as P0 for correctness.

## Decisions
- **Single-statement claim** via `updateMany` with a status filter — Postgres handles the compare-and-set atomically. No advisory locks, no SELECT-FOR-UPDATE.
- **Marzban call sits *outside* the DB transaction.** Long external I/O inside a tx would hold connections and risk deadlocks under load.
- **DB writes wrapped in `db.$transaction`** so account.create + transaction.update succeed-or-fail together. Prisma rolls back automatically on throw.
- **`failed` is claimable.** With the new atomic design, a failed transaction never has a linked Account, so retrying just generates a fresh Marzban username; any leftover Marzban user from the prior attempt is best-effort cleaned. This preserves Premzy's natural retry path and the admin's "🔄 تلاش مجدد" button.
- **`ProvisionConflictError` is a typed throw** so callers (admin handler, Premzy callback) can render conflict vs failure differently. The handler shows "already processed"; Premzy returns 200 so it stops retrying.
- **Orphan cleanup is best-effort, not synchronous.** If `marzban.removeUser` fails during cleanup we log and move on — Marzban users without a corresponding Account eventually expire and don't affect correctness.

## Verification
- `yarn test` — 115/115 pass (10 new tests).
- `npx eslint src/core/provision.ts src/bot/handlers/adminPayment.ts src/premzy/server.ts src/core/__tests__/provisionClaim.test.ts` — clean (two pre-existing `no-explicit-any` warnings in `premzy/server.ts`).
- Behaviour preserved on the happy path; the conflict path now returns deterministic results instead of double-provisioning.

## What's next
Step 8 in `WORKING.md`: replace TTL-only caches in `bot_messages` / `bot_settings` with a version-bumped cache so admin writes invalidate immediately.
# RECAP — Step 8: version-bumped cache for BotMessage / BotSetting

## What changed
- `src/bot/services/messageService.ts`:
  - Cache now keyed by a `version` counter in addition to `fetchedAt`. A read returns the cached map only if the version matches AND we're within the safety-net TTL.
  - Fallback TTL extended from 5 min to **30 min** (we no longer rely on TTL for correctness — it's a safety net for out-of-process writes like a manual `psql` edit).
  - New `bumpMessageCache()` — increments the version so the next read repopulates.
  - New `updateMessage(key, text)` — upserts the row and bumps the cache. **Future admin scenes must use this** instead of writing to `bot_messages` directly.
  - `invalidateCache()` retained for tests (hard reset).
- `src/bot/services/settingService.ts`: same treatment. Fallback TTL extended from 30 s to 5 min. New `bumpSettingCache()` and `updateSetting(key, value)` exports.
- `src/bot/services/index.ts`: re-exports the new write-through APIs so callers can `import { updateMessage, updateSetting }` from `../services`.
- `src/bot/services/__tests__/messageService.test.ts`: extended TTL test to match the new 30-min fallback; two new tests covering `bumpMessageCache` triggers immediate refetch, and `updateMessage` upserts + invalidates.

## Why
The TTL-only cache meant any admin write to `bot_messages` / `bot_settings` (whenever an admin edit scene lands) wouldn't propagate to running bot processes for up to 5 min — a long time during a hot-fix. The version counter lets in-process writes invalidate instantly while keeping a long fallback TTL as protection against out-of-process drift.

## Decisions
- **Long fallback TTL (5–30 min), short invalidation window.** The version bump is the primary correctness mechanism; the TTL exists only so a manual `psql` edit eventually surfaces without a process restart.
- **Write-through helpers (`updateMessage` / `updateSetting`).** Centralising the write + invalidate combo guarantees no caller can forget to bump.
- **`invalidateCache` retained.** It's a hammer for tests and emergencies; production code paths should use the write-through API or `bumpMessageCache` / `bumpSettingCache`.
- **No new dependencies.** `Map` + integer counter is sufficient at single-process scale. WORKING.md notes the multi-process path is Postgres `LISTEN/NOTIFY`, deferred.

## Verification
- `yarn test` — 107/107 pass (2 new tests).
- `npx eslint src/bot/services` — clean (one pre-existing `no-explicit-any` warning in the test file).

## What's next
Step 9 in `WORKING.md`: per-update user middleware cache — fold the `User`-by-`chat_id` lookup into a middleware that attaches `ctx.state.user` once per update.
