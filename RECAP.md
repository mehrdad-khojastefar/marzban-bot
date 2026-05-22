# Commit Recap

## What changed
Added a scheduled database backup feature: a `node-cron`-driven job runs `pg_dump | gzip | sha256` for both the Marzban panel DB and the bot DB, then ships each compressed dump as a Telegram document to its own dedicated topic in the existing event-log supergroup, with an HTML caption containing size, sha256, and duration. Admin gets a `🗄 پشتیبان‌گیری فوری` button in the home menu for on-demand runs that share the same pipeline.

## Key decisions
- **BotSetting-tunable schedule:** `backup_enabled` (`"false"` default) and `backup_cron` (`"0 3 * * *"` default) live in the `bot_settings` table, not env. Matches the precedent of `events_enabled` / `buy_enabled` — ops can pause or reschedule without a redeploy.
- **Topic reuse, not a new group:** Backups post to the existing `LOG_GROUP_ID` via two new env vars `LOG_TOPIC_BACKUP_MARZBAN` and `LOG_TOPIC_BACKUP_BOT`. The dump *document* goes directly via `sendDocument`; status events ride the standard `logEvent` plumbing to SYSTEM/ERRORS topics.
- **Direct Marzban Postgres connection:** Marzban was reachable only via HTTP API before this change. Added `MARZBAN_DATABASE_URL` env var consumed *only* by `pg_dump` (never wired into Prisma) to keep the new dependency narrow.
- **Single-pipeline dump:** `runDump` spawns pg_dump, pipes stdout through `zlib.createGzip()`, tees through `crypto.createHash('sha256')`, and writes to `/tmp/<db>-<ts>.sql.gz` in one stream — no uncompressed intermediate file ever hits disk.
- **Sequential DBs + in-process lock:** Two DBs back up one at a time inside a run; overlapping runs are prevented by an `isRunning` boolean in `runner.ts` (a second invocation drops with `system.backup_skipped`). Per-DB failures are isolated — a `marzban` failure does not abort `marzban_bot`.
- **No local retention:** Each tmp file is `unlink`ed in `finally` after upload (success OR failure). Telegram is the only backup store.
- **Invalid cron is recoverable:** Bad `backup_cron` emits `error.backup_misconfigured`, falls back to `DEFAULT_CRON`, and keeps running rather than silently stopping all backups.
- **`postgresql16-client` in the Docker image:** Final stage now installs `postgresql16-client` so `pg_dump` is on `PATH` for the non-root `doves` user at runtime.
- **Manual trigger as a handler, not a scene:** Followed the existing `src/bot/handlers/admin*.ts` pattern (no navigation surface needed — single button, fire-and-wait, single-message UI reply).

## Files changed
```
src/core/backup/dump.ts                       # NEW: spawn pg_dump, gzip+sha256, injectable spawner
src/core/backup/uploader.ts                   # NEW: buildCaption + sendBackupToTelegram
src/core/backup/runner.ts                     # NEW: 2-DB orchestrator + isRunning lock
src/core/backup/scheduler.ts                  # NEW: node-cron wrapper with reschedule API
src/core/backup/index.ts                      # NEW: barrel
src/core/backup/__tests__/dump.test.ts        # NEW: 3 tests (happy, pg_dump fail, gzip fail)
src/core/backup/__tests__/runner.test.ts      # NEW: 4 tests (happy, dump fail mid-run, upload fail, overlap-skipped)
src/core/backup/__tests__/scheduler.test.ts   # NEW: 2 tests (disabled, invalid cron fallback)

src/bot/handlers/adminBackup.ts               # NEW: admin "Backup now" handler
src/bot/handlers/index.ts                     # registered new handler
src/bot/bot.ts                                # wired registerAdminBackupHandler
src/bot/main.ts                               # start/stop scheduler with bot lifecycle
src/bot/scenes/home.ts                        # admin-only backup button (gated by backup_enabled)

src/core/events/types.ts                      # 5 new event payload types
src/core/events/eventFormat.ts                # 5 new formatters
src/core/events/__tests__/eventLogger.test.ts # added 3 env vars to test setup
src/core/utils/config.ts                      # 3 new env vars in envSchema
src/core/utils/__tests__/config.test.ts       # added 3 env vars to validEnv fixture

src/db/seeds/seed.ts                          # +2 BotSettings, +6 admin.backup.* messages

design/bot/jobs/backup.md                     # NEW: first background-job spec
ARCHITECTURE.md                               # NEW "Database Backup" decisions section
WORKING.md                                    # source brief (unchanged from prior PR)
.env.example                                  # 3 new vars + Backup section
Dockerfile                                    # postgresql16-client in final stage
package.json                                  # node-cron + @types/node-cron
yarn.lock                                     # regenerated
```

## Verification
- `yarn test`: 153/153 pass — includes 9 new tests covering the dump pipeline (happy, pg_dump non-zero, gzip stream failure), the runner (both DBs sequential with correct topic routing, partial DB failure, upload failure, overlap-skipped) and the scheduler (disabled = no schedule, invalid cron → default fallback + misconfigured event).
- `yarn lint`: zero new errors/warnings introduced by this change. Pre-existing lint debt in `adminBankCards.ts`, `adminSellerAccounts.ts`, `adminSellerDetail.ts`, and the unused `vi` import in `config.test.ts` is unchanged (those files were not modified by this PR).
- Manual verification deferred: needs a real `MARZBAN_DATABASE_URL`, a populated `LOG_GROUP_ID` with the two new backup topics, and `postgresql16-client` available on `PATH` (or via the updated Docker image).
