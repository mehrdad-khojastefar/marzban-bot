# RECAP — Speed & Scalability Plan

## What changed
- Rewrote `WORKING.md` to be the source of truth for the speed/scalability initiative: SLOs, prioritized findings (P0/P1/P2), an 11-step work plan, and a Definition of Done.
- Added a new top-level `Performance & Scalability Design` section to `DESIGN.md` covering:
  - Load model and target architecture diagram
  - Database indexing strategy (table → index → query speeded up)
  - Connection pool, in-process caching, and Marzban client design
  - Transactional boundaries for buy/renew flows
  - Observability contract (pino + prom-client, no new infra)
  - Explicit non-goals to prevent scope creep

## Why
The bot needs to handle 10K concurrent users on a single VPS. A codebase audit surfaced concrete bottlenecks — missing indexes, default Prisma pool size, N+1 reads in `adminViewAccount.ts`, unbounded `findMany` in `sellerReport.ts`, no Marzban keep-alive, no observability. We wrote the plan first so each follow-up PR is a small, reviewable, independently shippable change against a known target.

## Decisions
- **No Redis, no rewrite, no new infra.** In-process LRU + Postgres + a single Node process per surface (bot / sub / premzy) is enough at 10K. Revisit only if measurement says so.
- **Each step is its own PR.** Steps 1–11 are independently shippable. No bundling.
- **Indexes first.** Step 1 alone removes the worst full-table scans and is reversible by dropping the migration.

## Out of scope
Admin panel, CLI, E2E tests (already deferred in `TODO.md`).
