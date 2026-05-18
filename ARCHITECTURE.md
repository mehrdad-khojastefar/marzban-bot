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

---

## Performance & Scalability

### Index policy
Postgres does **not** auto-index foreign keys. Any column used in a `WHERE`, `ORDER BY`, or join condition in a per-update / per-request code path **must** have an explicit `@@index` in `prisma/schema.prisma`. This rule applies to every new scene and every new query.

Initial baseline (migration `20260518000000_add_performance_indexes`):
- `accounts`: `(user_id)`, `(seller_id)`, `(marzban_username)`, `(marzban_sub_token)`, `(expires_at)`, `(seller_id, payment_status)`
- `users`: `(status)`
- `payments`: `(user_id)`, `(status)`, `(user_id, status)`
- `transactions`: `(user_id)`, `(account_id)`, `(user_id, status)` (in addition to pre-existing `(status)` and `(premzy_order_id)`)

Composite indexes encode actual query shape — order matters. `(seller_id, payment_status)` accelerates "this seller's unpaid totals" but is useless for "all unpaid across sellers" (we'd add `(payment_status)` alone for that, only when a query path needs it).

### Why hand-written idempotent SQL?
The existing migration history uses `IF NOT EXISTS` / `IF EXISTS` patterns (see `20260508093043_drift_cleanup`) so migrations can recover from drift without manual surgery. Index migrations follow the same pattern: each `CREATE INDEX IF NOT EXISTS` is safe to re-run.
