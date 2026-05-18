# Speed & Scalability — SQL, Database, and Code-Layer Improvements

## Goal

Make the bot blazingly fast and capable of serving **10,000 concurrent users / accounts** on a single small VPS without infrastructure overhaul.

## Success Criteria (SLOs)

| Metric | Target |
|---|---|
| p50 update → reply latency (cached path) | < 80 ms |
| p95 update → reply latency | < 300 ms |
| p99 update → reply latency | < 800 ms |
| Marzban call p95 (cached token) | < 250 ms |
| Subscription endpoint p95 | < 50 ms |
| Sustained throughput | 200 updates/sec |
| Memory (bot process) | < 512 MB steady-state |
| Zero N+1 in any per-update code path | enforced by code review |

## Non-Goals

- No multi-region / sharding.
- No Redis dependency unless a P1 fix demands it (we'll attempt to stay in-process + Postgres).
- No rewrite. Surgical, reversible diffs only.
- No new features. UX behavior stays identical.

## Out of Scope (already on TODO.md)

- Admin panel.
- CLI.
- E2E tests.

---

## Findings Summary (from codebase audit)

See `DESIGN.md → Performance & Scalability Design` for the full design rationale and target architecture. Highlights:

### P0 — breaks at 10K
1. **Missing Postgres indexes** on `Account.user_id`, `Account.seller_id`, `Account.marzban_username`, `Account.marzban_sub_token`, `Account.expires_at`, `User.status`, `Payment.user_id`, `Payment.status`, `Seller.user_id`, `Transaction.user_id`, `Transaction.account_id`. (`prisma/schema.prisma`)
2. **No connection-pool sizing** on PrismaPg adapter (`src/core/db/client.ts`). Default 10 connections is a hard ceiling.
3. **N+1 in `adminViewAccount.ts`** — 9 `db.account.findUnique` calls across one session. Cache in `ctx.session`.
4. **`findMany` without aggregation** in `sellerReport.ts` — loads all rows to sum in JS. Use `db.account.aggregate`.
5. **No transaction boundaries** around renew / buy flows (`renewAccount.ts`, `buyAccount.ts`) → inconsistent state on partial failure.
6. **No Marzban username index** → subscription server full-scans on every request (`src/sub/server.ts`).

### P1 — bad latency under load
7. **Marzban Axios client** has no HTTP keep-alive agent → new TCP per call.
8. **Sequential awaits** in buy/renew scene handlers that should be `Promise.all`.
9. **`BotSetting` / `BotMessage` re-read per update** — wrap in proper LRU + pub-sub-style invalidation on writes (currently TTL only, stale up to 5 min).
10. **`select` discipline** missing across hot reads — fetching all columns when 2 fields suffice.
11. **Marzban token cache** has no proactive TTL refresh; relies on 401 → retry path.

### P2 — polish / observability
12. No slow-query logging, no request IDs, no Prisma query events.
13. No metrics endpoint (cannot detect what breaks first).
14. `BigInt` vs `Int` consistency on `chat_id` is fine (BigInt) but `data_limit` should stay BigInt (already is).
15. Background reminders / expiry scans (if any) are not paginated.

---

## Work Plan

Each step is independently shippable. Don't bundle. One PR per group.

### Step 1 — Schema indexes (P0, low-risk, biggest win)
- Add indexes in `prisma/schema.prisma`:
  - `Account`: `@@index([user_id])`, `@@index([seller_id])`, `@@index([marzban_username])`, `@@index([marzban_sub_token])`, `@@index([expires_at])`, `@@index([seller_id, payment_status])`
  - `User`: `@@index([status])`
  - `Payment`: `@@index([user_id])`, `@@index([status])`, `@@index([user_id, status])`
  - `Transaction`: `@@index([user_id])`, `@@index([account_id])`, `@@index([user_id, status])`
  - `Seller`: keep `chat_id` unique (already present); no new index needed.
- Generate migration; verify on a copy of prod data with `EXPLAIN ANALYZE`.
- **Deliverable:** one migration file + RECAP.md note. No code change.

### Step 2 — Prisma connection pool + slow-query logging (P0)
- In `src/core/db/client.ts`: pass `?connection_limit=25&pool_timeout=10` (or equivalent adapter setting) via `DATABASE_URL`, or pass through PrismaPg config.
- Enable Prisma `log: [{ level: 'query', emit: 'event' }]` and log queries > 100 ms with the params redacted.
- Document the new env-var format in `.env.example`.

### Step 3 — Marzban client hardening (P1)
- Add `http.Agent({ keepAlive: true, maxSockets: 50 })` + `https.Agent` to the axios instance.
- Add proactive token refresh: track `tokenIssuedAt`, refresh at 80% of TTL (assume 30 min if unknown).
- Add a small retry policy: 1 retry on network error / 5xx, no retry on 4xx.
- Add per-call timeout (`timeout: 8000`).
- **No** queue / circuit-breaker yet — measure first.

### Step 4 — Kill N+1 in `adminViewAccount.ts` (P0)
- After first `findUnique`, store account in `ctx.session.viewedAccount`.
- On any mutation, refresh once and re-cache.
- Add a unit test that counts Prisma calls via a mock and asserts ≤ 2 per scene action.

### Step 5 — Aggregate in `sellerReport.ts` (P0)
- Replace `findMany` + JS reduce with `db.account.aggregate({ where, _sum: { price: true }, _count: true })`.
- Same for the unpaid-stats path in `adminAccounts.ts` — fold into a single query with `groupBy`.

### Step 6 — `select` discipline on hot paths (P1)
- Audit every `findUnique` / `findMany` in `src/bot/scenes/**` and `src/bot/middleware/**`.
- Add explicit `select` for: user lookup by chat_id, plan lookup, bot_messages, bot_settings, sub-token lookup.
- Codify a rule in `CLAUDE.md` (interactive-mode change request, not autonomous).

### Step 7 — Transactional buy/renew (P0 for correctness)
- Wrap "create Transaction + decrement quota + reserve username" in `db.$transaction(...)`.
- On Marzban call failure, mark transaction `failed` in a follow-up tx — never leave `provisioning` orphaned.
- Add an idempotency check: same `transaction_id` reaching the executor twice is a no-op.

### Step 8 — In-process cache for `BotSetting` + `BotMessage` (P1)
- Replace TTL-only cache with a `Map` + version counter.
- On any admin write to `bot_settings` / `bot_messages`, bump the version → next read repopulates.
- For multi-process safety later: switch to Postgres `LISTEN/NOTIFY` (deferred, not in scope unless we go multi-process).

### Step 9 — Per-update user middleware cache (P1)
- A single `findUnique` per update for `User` by `chat_id`, attached to `ctx.state.user`.
- All downstream handlers read `ctx.state.user` instead of re-querying.
- Add a 30-second negative cache for `pending` / `banned` users so they don't hit the DB on every spam click.

### Step 10 — Observability baseline (P2 but ship before scaling test)
- Structured logger (pino) with `requestId` per update.
- `/metrics` endpoint (prom-client) exposing: updates/sec, prisma query duration histogram, marzban call duration, scene transition counts.
- Wire a `process.on('unhandledRejection')` that logs and continues.

### Step 11 — Load test (validation)
- Script a synthetic 10K-user replay (start, view, buy, renew, view).
- Run against a staging DB seeded with 10K users + 10K accounts.
- Confirm SLOs from the top of this doc. If any miss, open follow-up issue, don't extend this branch.

---

## Decision Log

Decisions taken while doing this work go in `ARCHITECTURE.md` (not here). Each PR's `RECAP.md` summarizes what changed and why.

## Definition of Done

- [ ] Steps 1–9 merged.
- [ ] `EXPLAIN ANALYZE` evidence for the 5 hottest queries attached to the PR for Step 1.
- [ ] Load-test report (Step 11) attached to the final PR.
- [ ] `yarn test` + `yarn lint` clean.
- [ ] `ARCHITECTURE.md` updated with any new architectural decisions.
- [ ] No new dependencies beyond `pino` and `prom-client` (and only if Step 10 lands).
