# Architecture

## Renew Flow — Architecture Decisions

### Why separate from buy?
- `renew_enabled` is independent of `buy_enabled`
- Use case: disable new sales but let existing users renew
- Renew modifies an existing Marzban account; buy creates a new one

### Fair accumulation model
The renew logic is additive and never penalizes users:
- **Data:** New data is ADDED to the current Marzban data_limit (not the DB value — Marzban is source of truth for current limits since admin can edit them)
- **Expiry:** Extended from `max(current_expire, now)` — active accounts extend from their expiry, expired accounts extend from now. No time is lost.
- **Usage:** Data consumption counter is NOT reset — user keeps their usage history

### Why read from Marzban, not DB?
Admin can manually edit data_limit and expiry via ADMIN_VIEW_ACCOUNT. The DB `Account.expires_at` may be stale. Marzban is the authoritative source for current account state. On renew:
1. `marzban.getUser()` → get current `data_limit` and `expire`
2. Calculate new values
3. `marzban.modifyUser()` → apply changes
4. Update DB record to match

### Reactivation
If account status is `expired`, `limited`, or `disabled` in Marzban, the renew call sets `status: 'active'` to reactivate it.

### Transaction type discrimination
A new `TransactionType` enum (`buy` | `renew`) on the Transaction model lets the admin approval handler and Premzy callback determine whether to call `provisionAccount()` (buy) or `renewAccount()` (renew).

## Group Modifications — Architecture Decisions

### Surface
Implemented as the in-bot admin scene `SCENE_ADMIN_GROUP_MODIFY`, not a `src/cli/` terminal command. WORKING.md called it a "CLI" but specified "the bot to wait" — the bot's conversational flow is the deliverable, and CLAUDE.md keeps `src/cli/` deferred.

### Filter model
Three single-choice selectors: prefix (`marzban_username` startsWith), seller (`seller_id`), and user chat-id (resolves `chat_id` → `user.id` → `account.user_id`). Filters are mutually exclusive; if the admin needs a tighter set, they uncheck individual accounts in the preview step.

### Marzban-as-truth reused
The same principle from the renew flow applies — per account we re-fetch live `data_limit` and `expire` from Marzban before computing deltas, so manual admin edits made directly in the Marzban panel aren't clobbered. DB `Account.expires_at` is updated only when `addDays` actually shifts the expiry.

### Why a per-account loop (not a batch endpoint)
Marzban exposes no batch modify endpoint. `applyToAccount` makes one `getUser`, at most one `modifyUser`, and at most one `resetUserDataUsage` per account.

### Concurrent worker pool
`executeBatch` runs N workers (core default 5; the scene reads `GROUP_MODIFY_CONCURRENCY` env, default 8) that share an atomic `nextIndex` counter — each worker grabs the next account, processes it, writes the result into a pre-allocated slot at its original index, and loops until exhausted. Sequential per-account, parallel across accounts. Results stay in input order regardless of completion order. Concurrency is intentionally bounded so we don't fan out hundreds of HTTP calls and trigger 503s from Marzban. If 503s become common, lower `GROUP_MODIFY_CONCURRENCY` in `.env`; the retry-failed button handles the rest. Values are clamped to [1, 50] at the scene boundary.

### Continue-on-error, not stop-or-rollback
A failure on one account does not abort the batch. Each result is captured in a `BatchReport` with per-account success/failure + error message. The admin sees the count summary and can drill into up to 30 detailed failures from the final report. Rationale: rollback is brittle (the rollback itself can fail), and the admin can re-run with a tighter filter on the failed usernames.

### Queue semantics
At-most-one entry per op type. Tapping `add_gb` / `add_days` opens an editor with the current value pre-filled; entering `0` removes the op. Ban and Unban share one status slot and are mutually exclusive. This avoids ambiguity about ordering or summation when stacking edits.

### No new Prisma models
The feature reads existing `Account` rows by `marzban_username` prefix, `seller_id`, or via `user.chat_id`. No migration required.

