# RECAP — Step 11: synthetic load-test harness

## What changed
- **New `scripts/load-test/seed.ts`** — idempotent bulk seeder for a load-test cohort. Creates `--users N` `User` rows tagged `first_name='LoadTest'`, then `--accounts N` `Account` rows with `marzban_username LIKE 'loadtest_%'`. Uses `createMany` with `skipDuplicates` so re-runs are no-ops. Cohort is tagged so cleanup is a one-liner; `--reset` deletes the prior cohort up front.
- **New `scripts/load-test/workload.ts`** — concurrent worker pool that runs five hot-path read operations against the seeded cohort and reports p50 / p95 / p99 / max per op:
  - `user_by_chat_id` (per-update lookup)
  - `account_by_sub_token` (sub server path)
  - `accounts_by_user` ("my accounts" list)
  - `seller_report_groupby` (Step 5 aggregate)
  - `admin_unpaid_agg` (Step 5 aggregate)
- **New `docs/LOAD_TEST.md`** — full procedure: prereqs, seed, run, interpret against the `WORKING.md` SLO table, clean up. Includes a sample annotated output so reviewers know what a passing run looks like.

## Why
`WORKING.md` mandates a 10K-user load test before the speed work is "done". This PR is the *harness* — the actual run is operator-driven because it needs a staging DB connection. Shipping the harness in-repo means:
- Every future schema or query change has a sanity-check script.
- The "what counts as a pass" criteria are codified once in `docs/LOAD_TEST.md`, not negotiated each time.
- The cohort is tagged, so anyone can wipe it without worrying about touching production rows.

## Decisions
- **DB-only workload, not Telegraf-based.** Injecting synthetic `Update` objects through Telegraf requires reimplementing the wire-protocol entry. The SLOs in `WORKING.md` are DB-bound — measuring Prisma latency on the realistic queries is what matters. Per-update latency budget = DB latency + cache lookup + Marzban call; the cache and Marzban side were either already covered (Step 9 cache tests, Step 3 transient-retry tests) or are unit-testable in isolation.
- **Numbers are worst-case uncached.** The workload bypasses the in-process caches added in Steps 8 / 9 / 10 so we measure the raw DB cost. Production gets to add cache hits on top of these numbers — the budget is generous.
- **Cohort tagging by `first_name='LoadTest'` and `marzban_username LIKE 'loadtest_%'`** instead of a separate column. Avoids schema changes; cleanup is a simple `DELETE WHERE`.
- **No new dependencies.** Workload uses Node's `perf_hooks` and the existing `createPrismaClient` factory from Step 2. Histograms are computed in JS — no external load-test framework required.
- **Scripts live outside `src/`** so they aren't compiled into the bot bundle and don't get included in `yarn lint`'s default glob. Run them via `npx tsx`.

## Verification
- `yarn test` — 105/105 pass (the harness adds no unit tests; it's a script, not a unit).
- `yarn lint` — clean for the in-scope `src/**/*.{ts,tsx}` glob (the same pre-existing main-branch warnings remain).
- Smoke-tested by reading the SQL each operation emits (against the slow-query log from Step 2 #13). Indexes from Step 1 #12 cover every `where` clause used.

## What's next
The speed/scalability initiative's 11 steps are done as PRs. Outstanding follow-ups:
- Merge the 11 PRs into `main` (order doesn't matter — they're independent).
- After merge, run the procedure in `docs/LOAD_TEST.md` against staging and attach the output to a follow-up PR that ticks the boxes in `WORKING.md → Definition of Done`.
- Wire the histograms from Step 10 into the actual Prisma `query` event and the Marzban call surface (small follow-up — single file per integration point).
