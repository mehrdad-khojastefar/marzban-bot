# BACKUP

## Goal

Back up the two PostgreSQL databases used by this project — `marzban` (VPN
panel) and `marzban_bot` (this bot) — on a cron schedule, and post each
dump to its own dedicated topic inside the existing Telegram log group,
with metadata (size, sha256, duration, timestamp). The admin can also
trigger a backup on demand from the admin menu.

This is the first background job in the project. No user-facing scene.

---

## Feature Flag

`backup_enabled` (BotSetting) — `"true"` / `"false"`, default `"false"`.

- When `"false"`: cron is not scheduled, the admin "Backup now" button
  short-circuits with a Persian "feature disabled" reply. Toggling to
  `"true"` reschedules without a restart.
- Matches the precedent of `events_enabled`, `buy_enabled`, etc.

---

## Schedule

`backup_cron` (BotSetting) — cron expression, default `"0 3 * * *"`
(03:00 server time, daily).

- Parsed with `node-cron`'s validator at scheduler start and on every
  BotSetting write.
- Invalid expression → emit `error.backup_misconfigured`, fall back to
  the default `"0 3 * * *"` and keep running.
- Changing `backup_cron` via the BotSetting calls
  `backupScheduler.reschedule()` — no restart needed.

---

## New Env Vars

Added to `src/core/utils/config.ts` (Zod `envSchema`) AND
`.env.example`:

| Var | Required | Purpose |
|---|---|---|
| `MARZBAN_DATABASE_URL` | yes | Connection string for the Marzban Postgres instance — `pg_dump` only, never wired to Prisma. |
| `LOG_TOPIC_BACKUP_MARZBAN` | yes (int) | `message_thread_id` for the marzban-DB backup topic in `LOG_GROUP_ID`. |
| `LOG_TOPIC_BACKUP_BOT` | yes (int) | `message_thread_id` for the marzban_bot-DB backup topic in `LOG_GROUP_ID`. |

`LOG_GROUP_ID` is the **existing** event-logger group — backups reuse
it. No new group is introduced.

---

## Pipeline (runs once per DB, sequentially)

For each DB (`marzban`, then `marzban_bot`):

1. Build a tmp path: `/tmp/<db>-<YYYYMMDD-HHmmss>.sql.gz`.
2. `child_process.spawn('pg_dump', ['--no-owner', '--no-privileges',
   '--clean', '--if-exists', connStr])`.
3. Pipe `stdout` → `zlib.createGzip()` → file write stream.
4. Tee the gzipped bytes through `crypto.createHash('sha256')` to
   compute the digest while streaming. Capture stderr to a string
   (last ~2 KB).
5. On `pg_dump` exit code `0`: `fs.stat` for size, send to Telegram
   (see Caption + Upload), then `fs.unlink` the tmp file.
6. On non-zero exit or any stream error: emit `error.backup_failed`
   with the stderr tail, `fs.unlink` any partial tmp file, move on
   to the next DB. **No in-run retry** — the next cron tick is the
   retry.

---

## Telegram Caption + Upload

Sent via `bot.telegram.sendDocument(env.LOG_GROUP_ID, { source:
fs.createReadStream(filePath), filename }, { message_thread_id,
caption, parse_mode: 'HTML' })`.

- `message_thread_id` is `LOG_TOPIC_BACKUP_MARZBAN` or
  `LOG_TOPIC_BACKUP_BOT` depending on the DB.
- Caption (HTML, admin-internal, lives inline in
  `src/core/events/eventFormat.ts`-style helper — NOT in
  `bot_messages`):

```
<b>🗄 backup · marzban</b>
date: 2026-05-23 03:00:14 UTC
size: 84.3 MB
sha256: <code>a1b2c3d4…</code>
duration: 7.4 s
```

`size` formatted human-readable, `sha256` truncated to first 16 chars
in the caption (full hash logged via event payload).

---

## Concurrency

- The two DBs back up **sequentially** inside one scheduled run (less
  load on the box, one Telegram upload at a time).
- Two scheduled runs cannot overlap: the runner holds an in-process
  `isRunning: boolean` flag. If a cron tick fires while the previous
  run is still going, the new tick is dropped and
  `system.backup_skipped` is emitted.
- Manual trigger respects the same flag — admin gets "in progress"
  Persian reply if a run is mid-flight.

---

## Manual Trigger (admin)

- Add `🗄 پشتیبان‌گیری فوری` button to the admin root scene
  (`src/bot/scenes/admin/index.ts` pattern).
- Handler: gated by `backup_enabled === "true"`. Calls the same
  runner used by cron with `{ trigger: 'manual' }`. Replies inline
  via `ctx.editMessageText(...)` (single-message UI):
  - while running: `admin.backup.running`
  - on success: `admin.backup.done`
  - on failure: `admin.backup.failed` with `{reason}` substituted.

---

## Event Tracking (mandatory per CLAUDE.md)

Added to `src/core/events/types.ts` `EventPayloadMap` and formatted in
`src/core/events/eventFormat.ts`:

| Type | Payload | Routed to |
|---|---|---|
| `system.backup_started` | `{ source: 'cron' \| 'manual', dbs: string[] }` | `LOG_TOPIC_SYSTEM` |
| `system.backup_completed` | `{ db, size_bytes, sha256, duration_ms, trigger }` (one per DB) | `LOG_TOPIC_SYSTEM` |
| `system.backup_skipped` | `{ reason: 'already_running' \| 'feature_disabled' }` | `LOG_TOPIC_SYSTEM` |
| `error.backup_failed` | `{ db, stage: 'pg_dump' \| 'gzip' \| 'upload', message, trigger }` | `LOG_TOPIC_ERRORS` |
| `error.backup_misconfigured` | `{ key: 'backup_cron', value, reason }` | `LOG_TOPIC_ERRORS` |

`logEvent(...)` is fire-and-forget — never wrap in try/catch. The
backup *document* itself is sent via `sendDocument` directly (not
through `logEvent`), to the two new dedicated backup topics.

---

## New Bot Messages (`bot_messages` rows + `design/bot/messages.md`)

| Key | Persian | Variables |
|---|---|---|
| `admin.backup.button` | `🗄 پشتیبان‌گیری فوری` | — |
| `admin.backup.running` | `در حال تهیه پشتیبان…` | — |
| `admin.backup.done` | `پشتیبان با موفقیت ارسال شد.` | — |
| `admin.backup.failed` | `خطا در تهیه پشتیبان: {reason}` | `reason` |
| `admin.backup.disabled` | `قابلیت پشتیبان‌گیری غیرفعال است.` | — |
| `admin.backup.in_progress` | `یک پشتیبان‌گیری در حال اجراست. لطفاً صبر کنید.` | — |

Add to `src/db/seeds/seed.ts` and `design/bot/messages.md`.

---

## New BotSettings (`bot_settings` rows)

Seeded in `src/db/seeds/seed.ts`:

| Key | Default | Purpose |
|---|---|---|
| `backup_enabled` | `"false"` | Master on/off. |
| `backup_cron` | `"0 3 * * *"` | Cron expression. |

---

## Implementation Order

1. `src/core/backup/dump.ts` — `runDump(connStr, outPath): Promise<{
   sizeBytes, sha256, durationMs }>`. Pure pipeline: spawn pg_dump,
   pipe through gzip + sha256, write to file. Mockable spawner for
   unit tests.
2. `src/core/backup/uploader.ts` — `sendBackupToTelegram(bot, { db,
   filePath, meta, topicId })`. Builds HTML caption, calls
   `sendDocument`.
3. `src/core/backup/runner.ts` — orchestrates both DBs sequentially,
   holds the `isRunning` lock, emits all events, unlinks tmp files
   in `finally`. Exports `runBackups(bot, trigger: 'cron' | 'manual')`.
4. `src/core/backup/scheduler.ts` — wraps `node-cron`. Reads
   `backup_cron` + `backup_enabled` from settings. Exposes
   `start(bot)`, `stop()`, `reschedule()`. Call `reschedule()` from
   any code path that updates the two settings (so settings service
   invalidation + scheduler.reschedule fire together).
5. `src/bot/scenes/admin/backupTrigger.ts` — admin button + handler.
6. `src/bot/scenes/admin/index.ts` — wire the new button into the
   admin root menu.
7. `src/db/seeds/seed.ts` — seed the 2 settings + 6 bot_messages.
8. `src/bot/main.ts` — `await backupScheduler.start(bot)` after
   `bot.launch()`; `backupScheduler.stop()` in the shutdown hook
   alongside the existing teardown.
9. `src/core/utils/config.ts` + `.env.example` — add the 3 new env
   vars.
10. `Dockerfile` — append `RUN apk add --no-cache postgresql16-client`
    to the final stage (the `node:24-alpine` non-root image).
11. `package.json` — add `node-cron` (runtime) and `@types/node-cron`
    (dev).
12. Tests under `src/tests/core/backup/` mirroring sources. Mock
    `child_process.spawn` and `bot.telegram.sendDocument`. Cover:
    happy path (both DBs), pg_dump non-zero exit, upload failure,
    overlap-skipped, invalid cron fallback.
13. `design/bot/jobs/backup.md` — first background-job spec, mirrors
    the section structure of this WORKING.md (no Trigger/Keyboards
    since it's not a scene).

---

## Done When

- [ ] All five event types wired (`types.ts` + `eventFormat.ts` +
      `logEvent` calls at every inflection point in the runner).
- [ ] Two new BotSettings + six new bot_messages seeded.
- [ ] Three new env vars validated by Zod at boot.
- [ ] `Dockerfile` ships with `postgresql16-client`.
- [ ] Manual trigger button visible in the admin root menu when
      `backup_enabled = "true"`.
- [ ] Scheduler starts/stops cleanly with the bot lifecycle.
- [ ] `yarn lint` clean, `yarn test` green (unit tests cover the
      runner's success + failure + skip paths).
- [ ] `ARCHITECTURE.md` gains a "Database Backup" section:
      BotSetting-tunable cron, pg_dump | gzip | sha256 shape,
      sequential DB runs, `isRunning` lock, postgresql16-client in
      Docker, no local retention.
- [ ] `RECAP.md` written.
- [ ] Commit: `feat(bot): scheduled DB backup to Telegram`.
