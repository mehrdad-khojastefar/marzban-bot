# Synthetic Load Test

This is the procedure documented in `WORKING.md` Step 11 — a way to validate the bot's database layer against the SLOs in that file before declaring the speed/scalability work done. **Run it against a staging database; never against production.**

## Prerequisites

- A reachable Postgres instance with the migrations applied (`yarn db:migrate`).
- `DATABASE_URL` pointed at staging in `.env` (or exported in the current shell).
- Optional: `DB_POOL_MAX` raised to match your intended concurrency (default 25).

## Step 1 — Seed the cohort

Bulk-create a known address space of users + accounts. The seeder is idempotent on the cohort tag (`users.first_name = 'LoadTest'`, `accounts.marzban_username LIKE 'loadtest_%'`), so re-runs skip existing rows.

```bash
# defaults: 10 000 users + 10 000 accounts
npx tsx scripts/load-test/seed.ts

# bigger cohort
npx tsx scripts/load-test/seed.ts --users 50000 --accounts 50000

# wipe the prior cohort and re-seed
npx tsx scripts/load-test/seed.ts --reset
```

Expect ~3–8 s per 10 000 rows on a small VPS.

## Step 2 — Run the workload

```bash
# defaults: 50 concurrent workers, 60 s, 3 s warmup
npx tsx scripts/load-test/workload.ts

# heavier
npx tsx scripts/load-test/workload.ts --concurrency 100 --duration 120 --warmup 5
```

The script exercises five read paths uniformly:

| Operation | What it tests |
|---|---|
| `user_by_chat_id` | The per-update lookup in `attachUser` middleware. |
| `account_by_sub_token` | The `src/sub/server.ts` lookup on every subscription fetch. |
| `accounts_by_user` | The "my accounts" list in user-facing scenes. |
| `seller_report_groupby` | The Step 5 `groupBy` over a seller's accounts. |
| `admin_unpaid_agg` | The Step 5 `aggregate` for admin stats. |

**Important:** the workload talks to Prisma directly — it bypasses the in-process caches added in Steps 8 / 9 / 10. The numbers are a worst-case **uncached** snapshot. In production the cache hit rate should pull p95 well below what you see here.

## Step 3 — Interpret the output

Sample output (annotated):

```
[workload] elapsed=60.1s ops=148231 errors=0 throughput=2466.7/s
────────────────────────────────────────────────────────────────────────
user_by_chat_id          count= 29612 err=  0 p50=1.7ms  p95=4.8ms  p99=11.2ms max=58.4ms
account_by_sub_token     count= 29528 err=  0 p50=2.1ms  p95=5.3ms  p99=12.7ms max=63.1ms
accounts_by_user         count= 29644 err=  0 p50=2.4ms  p95=6.1ms  p99=14.9ms max=82.3ms
seller_report_groupby    count= 29671 err=  0 p50=3.5ms  p95=8.2ms  p99=19.4ms max=91.0ms
admin_unpaid_agg         count= 29776 err=  0 p50=2.9ms  p95=7.0ms  p99=16.8ms max=72.8ms
```

Cross-reference with the SLOs in `WORKING.md`:

| Metric | Target | Pass if |
|---|---|---|
| p50 (uncached) | < 80 ms | every row's `p50` < 80 ms |
| p95 (uncached) | < 300 ms | every row's `p95` < 300 ms |
| p99 (uncached) | < 800 ms | every row's `p99` < 800 ms |
| Throughput | 200 ops/sec (cached, full flow) | `throughput` > 1000 ops/sec for these raw reads — the cached scene flow will be slower per op but reach the 200/s update target |

If any row blows past the budget:
- **Single op is slow** → look at the `EXPLAIN ANALYZE` for that query (probably a missing index — re-check `prisma/schema.prisma` against the Step 1 list).
- **All ops slow** → check pool exhaustion (`DB_POOL_MAX` vs concurrency) or DB resource limits.
- **Throughput plateaus** → CPU vs IO; consult `pg_stat_statements` and `pg_stat_activity` for what the DB is actually spending time on.

## Step 4 — Clean up

```bash
npx tsx scripts/load-test/seed.ts --reset
# or, by hand:
# DELETE FROM accounts WHERE marzban_username LIKE 'loadtest_%';
# DELETE FROM users WHERE first_name = 'LoadTest';
```

## When to re-run

Re-run the workload after:
- Any change to `prisma/schema.prisma` (especially index changes).
- Any change in `src/core/db/client.ts` (pool sizing, adapter config).
- Any change to a query in a hot path (per-update / per-request middlewares, the sub server).

Save the output text alongside the PR description so reviewers can compare before/after.
