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

## Database Backup — Architecture Decisions

### Why a separate connection string for Marzban
The bot already talks to the Marzban panel over HTTP (`src/core/marzban/client.ts`) — it has never needed direct DB access. Backup is the first job that does. Adding `MARZBAN_DATABASE_URL` keeps the new dependency narrow: it is consumed only by `pg_dump`, never wired into Prisma, and the bot remains functional without it only at boot if explicitly stubbed (Zod requires it as part of the env schema).

### `pg_dump | gzip | sha256` in a single stream
`runDump` spawns `pg_dump`, pipes stdout through `zlib.createGzip()`, tees the gzipped bytes through `crypto.createHash('sha256')`, and writes to a tmp file in one pipeline. Size, hash, and duration are reported in a single `DumpResult`. No intermediate uncompressed file ever hits disk — the bot runs as a non-root user with limited tmp space, and Marzban DBs can be hundreds of MB.

### BotSetting-tunable schedule
`backup_enabled` and `backup_cron` live in the `bot_settings` table, matching the precedent of `events_enabled`, `buy_enabled`, etc. Operations changes (pause backups for a maintenance window, shift the hour) don't require a redeploy. `rescheduleBackupScheduler(bot)` is the public hook for applying live changes.

### Sequential DB runs + in-process lock
The two DBs back up one at a time inside a single scheduled run — lower simultaneous pg_dump load, one Telegram upload at a time. Overlapping runs are prevented by an in-process `isRunning` boolean in `runner.ts`. A cron tick or manual button press that arrives while a run is in flight emits `system.backup_skipped` instead of stacking up. The lock is intentionally process-local (not Redis/DB) because the scheduler itself only exists inside the single bot process.

### Continue-on-error across DBs
A `pg_dump` or upload failure for `marzban` does NOT abort `marzban_bot`. Each DB result is captured independently and reported via `system.backup_completed` (success) or `error.backup_failed` (with `stage: 'pg_dump' | 'gzip' | 'upload'`). The manual-trigger button surfaces the per-DB error list in the admin's reply.

### Topic reuse over a separate group
Backups post to the existing `LOG_GROUP_ID` event-tracking supergroup, using two new dedicated topics (`LOG_TOPIC_BACKUP_MARZBAN`, `LOG_TOPIC_BACKUP_BOT`). Same pattern the eventLogger uses for per-category routing — no new group concept introduced. Status events (`system.backup_*`, `error.backup_*`) still ride the SYSTEM/ERRORS topics via `logEvent`; only the binary dump itself goes to a backup topic, via `sendDocument`.

### No local retention
Each tmp file is `unlink`ed in a `finally` after upload (success OR failure). Telegram is the only backup store; there is no rolling local copy. This matches the "the bot owns nothing" philosophy of the project and avoids a slow disk-fill failure mode on the host.

### `postgresql16-client` in the Docker image
The final stage of `Dockerfile` (`node:24-alpine`, non-root `doves`) installs `postgresql16-client` so `pg_dump` is on `PATH` at runtime. Pinning to `16` keeps the client version explicit — bump the version suffix when the upstream Marzban or bot DB server is upgraded past 16.

### Invalid cron is recoverable, not fatal
If `backup_cron` parses as invalid, the scheduler emits `error.backup_misconfigured`, falls back to `DEFAULT_CRON` (`0 3 * * *`), and keeps running. Silent total stoppage would be worse than running on an unexpected schedule — the misconfigured event tells the admin to fix it.

## Move Account Ownership — Architecture Decisions

### DB-only state change
`accounts.user_id` is the only field that moves; Marzban itself does not model account ownership (it only knows the Marzban username). No Marzban API call is made when ownership transfers. `marzban_username`, `marzban_sub_token`, plan, expiry, and balance stay exactly as they were.

### `seller_id` is preserved on move
The `data` payload of the Prisma update intentionally contains only `user_id`. The original seller's attribution is left in place so seller reports/commission tracking keep working after an admin re-homes an account.

### Unknown contacts are rejected, not auto-created
If the contact the admin shares is not yet a registered `User`, the move is refused. This is consistent with the existing approval flow (a user must `/start`, become `pending`, and be approved before they can interact with the bot at all). Silently creating a user on ownership transfer would bypass that gate.

### Reply-keyboard exception to the single-message UI rule
Telegram's `request_contact` is only available on reply keyboards, not inline keyboards. The scene therefore briefly sends a second message that carries the reply keyboard, then dismisses it (via `delete_message` + a zero-width-space `remove_keyboard` message) the moment a valid contact arrives or the admin cancels. This is the same kind of carve-out the project already makes for config/subscription links.

