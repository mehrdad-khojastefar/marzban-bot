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
