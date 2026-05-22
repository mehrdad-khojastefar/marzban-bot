# Database Backup — Background Job Spec

First background job in the project. Not a scene — runs on a cron schedule
and on admin demand. Posts each DB dump as a Telegram document to its own
topic inside the existing event-log supergroup.

## Purpose
Snapshot both Postgres databases on a schedule, and ship each snapshot to
Telegram so the admin always has a recent off-site copy with a
verifiable hash.

## Trigger
- **Cron** — `node-cron` task scheduled at boot from the `backup_cron`
  BotSetting. Reschedule by calling `rescheduleBackupScheduler(bot)`.
- **Manual** — admin button `🗄 پشتیبان‌گیری فوری` in the home menu
  (visible only when `backup_enabled = "true"`). Handled by
  `bot.action('admin_backup', …)` in `src/bot/handlers/adminBackup.ts`.

Both triggers funnel into the same `runBackups({ bot, trigger })`
function — the only difference is the `trigger` field on emitted events.

## Settings (runtime tunable, `bot_settings` table)
| Key | Default | Effect |
|---|---|---|
| `backup_enabled` | `"false"` | Master on/off. When `"false"`: cron is not scheduled and the manual button short-circuits with a Persian "disabled" alert. |
| `backup_cron` | `"0 3 * * *"` | Cron expression. Invalid expressions emit `error.backup_misconfigured` and fall back to default. |

## Env vars
| Var | Purpose |
|---|---|
| `MARZBAN_DATABASE_URL` | Marzban Postgres conn string — used by `pg_dump` only. |
| `LOG_GROUP_ID` | Existing event-log group — reused for backup destinations. |
| `LOG_TOPIC_BACKUP_MARZBAN` | `message_thread_id` for the marzban DB dump. |
| `LOG_TOPIC_BACKUP_BOT` | `message_thread_id` for the marzban_bot DB dump. |

## Pipeline (per DB, sequential)
1. Build tmp path: `/tmp/<db>-<YYYYMMDD-HHmmss>.sql.gz`.
2. `spawn('pg_dump', ['--no-owner','--no-privileges','--clean','--if-exists', connStr])`.
3. Pipe `stdout` → `zlib.createGzip()` → file write stream; tee through
   `crypto.createHash('sha256')` to compute the digest in one pass.
4. On `pg_dump` exit `0`: `fs.stat` for size, then `sendDocument` with
   HTML caption, then `unlink`.
5. On non-zero exit or stream error: emit `error.backup_failed` with the
   stderr tail (≤4 KB), `unlink` partial file. No in-run retry — the
   next cron tick is the retry.

DB-level failures are isolated: if `marzban` fails, `marzban_bot` is
still attempted.

## Caption (HTML, admin-internal)
```
<b>🗄 backup · marzban</b>
date: 2026-05-23 03:00:14 UTC
size: 84.3 MB
sha256: <code>a1b2c3d4…</code>
duration: 7.4 s
```

## Concurrency
- DBs back up **sequentially** within one run.
- Runs **cannot overlap**: in-process `isRunning` flag guards entry.
  Second call (manual or cron) drops with `system.backup_skipped`.

## Events emitted
| Type | Payload | Topic |
|---|---|---|
| `system.backup_started` | `{ trigger, dbs }` | SYSTEM |
| `system.backup_completed` | `{ db, sizeBytes, sha256, durationMs, trigger }` (one per DB) | SYSTEM |
| `system.backup_skipped` | `{ trigger, reason }` | SYSTEM |
| `error.backup_failed` | `{ db, stage, message, trigger }` | ERRORS |
| `error.backup_misconfigured` | `{ key, value, reason }` | ERRORS |

The backup *document* itself is NOT routed through `logEvent` — it goes
directly to its dedicated topic via `sendDocument`.

## Files
| Path | Role |
|---|---|
| `src/core/backup/dump.ts` | `runDump()` — pg_dump+gzip+sha256, injectable spawner. |
| `src/core/backup/uploader.ts` | `sendBackupToTelegram()` + `buildCaption()`. |
| `src/core/backup/runner.ts` | `runBackups()` orchestrator + `isRunning` lock. |
| `src/core/backup/scheduler.ts` | `startBackupScheduler()`, `stopBackupScheduler()`, `rescheduleBackupScheduler()`. |
| `src/bot/handlers/adminBackup.ts` | Manual-trigger button handler. |
| `src/bot/scenes/home.ts` | Adds the admin button when `backup_enabled = "true"`. |

## Persian copy (`bot_messages`)
| Key | Text |
|---|---|
| `admin.backup.button` | `🗄 پشتیبان‌گیری فوری` |
| `admin.backup.running` | `⏳ در حال تهیه پشتیبان…` |
| `admin.backup.done` | `✅ پشتیبان با موفقیت ارسال شد.` |
| `admin.backup.failed` | `❌ خطا در تهیه پشتیبان:\n{reason}` |
| `admin.backup.disabled` | `قابلیت پشتیبان‌گیری غیرفعال است.` |
| `admin.backup.in_progress` | `یک پشتیبان‌گیری در حال اجراست. لطفاً صبر کنید.` |

## Docker
The runtime image needs `pg_dump` available on `PATH`. Final stage of
`Dockerfile` installs `postgresql16-client` via apk. Bump the version
suffix when either DB server is upgraded.

## Tests
- `src/core/backup/__tests__/dump.test.ts` — happy path (gzip+sha256
  verification by reading the written file back through gunzip),
  pg_dump non-zero exit (DumpError stage=pg_dump), pipeline failure
  (DumpError stage=gzip).
- `src/core/backup/__tests__/runner.test.ts` — both DBs in sequence
  with correct topic routing, partial failure (DB1 fails, DB2 succeeds),
  upload failure on first DB, overlap-skipped path.
- `src/core/backup/__tests__/scheduler.test.ts` — disabled = no
  schedule, invalid cron → fallback + misconfigured event.
