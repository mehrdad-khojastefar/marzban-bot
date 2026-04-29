# Architecture — User Notification System

## Overview

Background scheduler that monitors active VPN accounts and notifies users via Telegram when they're approaching data or time limits. Runs independently of user interactions — no scene, no command trigger.

## Data Sources

### Marzban API (`getUser(username)`)
Returns `UserResponse` with:
- `used_traffic` — bytes consumed
- `data_limit` — bytes allowed (null = unlimited)
- `expire` — Unix timestamp of account expiry (null = no expiry)
- `status` — `active` / `disabled` / `limited` / `expired` / `on_hold`

### Local DB (`accounts` table)
- `marzban_username` — key to fetch from Marzban
- `user_id` — FK to `users.id` (needed for `chat_id` to send Telegram message)
- `expires_at` — redundant with Marzban but useful for initial filtering
- `created_at` — needed for speed-of-use calculation

## New Model: `NotificationLog`

Tracks what was sent and when, prevents duplicate notifications, supports silence.

```prisma
model NotificationLog {
  id              Int       @id @default(autoincrement())
  account_id      Int
  rule            String    // "speed_predict" | "low_data" | "low_time"
  sent_at         DateTime  @default(now())
  silenced_until  DateTime? // set when user clicks "silence 3 days"
  account         Account   @relation(fields: [account_id], references: [id])

  @@unique([account_id, rule])
  @@map("notification_logs")
}
```

**One row per (account, rule).** Updated on each send. `silenced_until` checked before sending — if set and in the future, skip.

Why a single row per (account, rule) instead of an append log:
- We only care about the latest state (last sent time + silence status)
- No historical reporting requirement
- Simpler queries, no cleanup needed

## Notification Rules

All rules evaluate per-account. An account can trigger multiple rules simultaneously.

### Rule 1: Speed Prediction (`speed_predict`)
```
average_speed = used_traffic / time_since_creation
remaining_data = data_limit - used_traffic
time_to_limit = remaining_data / average_speed
```
- Trigger: `time_to_limit < 7 days`
- Message includes: predicted days + hours until limit
- Frequency: once per day (checked via `sent_at`)

### Rule 2: Low Data (`low_data`)
```
remaining_data = data_limit - used_traffic
```
- Trigger: `remaining_data < 1 GB`
- Frequency: once per day

### Rule 3: Low Time (`low_time`)
```
time_left = expire - now
```
- Trigger: `time_left < 5 days`
- Frequency: once per day

### Frequency Enforcement
Each rule sends at most once per 24 hours per account. Checked via `notification_logs.sent_at`:
```
skip if: now - sent_at < 24 hours
skip if: silenced_until > now
```

## Silence Mechanism

User clicks inline button `🔇 سکوت ۳ روز` on any notification message.
- Callback data: `notif_silence:<account_id>`
- Handler sets `silenced_until = now + 3 days` on ALL notification_log rows for that account
- Applies globally per account — silences all rule types, not just the one that triggered

Why per-account (not per-user): a user may have multiple accounts, and only want to silence the one they already know about.

## Scheduler

### Implementation: `setInterval` in bot process
No external cron. Runs inside the same Node.js process as the bot.

```
Interval: 1 hour
```

Why not a separate process:
- Single deployment target (one bot process)
- Needs access to both Prisma client and Telegram bot instance
- Account count is small enough that hourly batch processing is fine

### Scheduler Flow
```
Every 1 hour:
  1. Query active accounts (expires_at > now, user.status = approved)
  2. For each account:
     a. Fetch Marzban user data (used_traffic, data_limit, expire)
     b. Skip if status is not "active"
     c. Skip if data_limit is null (unlimited)
     d. Evaluate all 3 rules
     e. For each triggered rule:
        - Check notification_log for cooldown (24h) and silence
        - If should send → send Telegram message → upsert notification_log
  3. Log summary: checked N accounts, sent M notifications
```

### Rate Limiting
- Marzban API: sequential requests with no artificial delay (local network, low volume)
- Telegram API: Telegraf handles rate limiting internally
- If account count grows past ~500, batch Marzban requests with concurrency limit (p-limit)

## Service: `notificationService`

Lives in `src/core/notification/`. Stateless functions, no singleton pattern needed.

```typescript
// Evaluate an account against all rules, return which ones should fire
evaluateAccount(marzbanUser: UserResponse, account: Account): NotificationRule[]

// Check cooldown + silence, send if appropriate, update log
processNotification(accountId: number, userId: number, rule: NotificationRule, data: NotificationData): Promise<boolean>

// Start the interval timer
startNotificationScheduler(bot: Telegraf, db: PrismaClient): void
```

## Callback Handler

Registered globally (like `adminPayment` handler), not inside a scene:
```typescript
bot.action(/^notif_silence:(\d+)$/, async (ctx) => {
  const accountId = parseInt(ctx.match[1])
  // verify account belongs to ctx.from.id
  // set silenced_until = now + 3 days for all rules on this account
  // edit message to confirm silence
})
```

## Startup Integration

Added to the existing startup sequence in `src/bot/main.ts`:
```
loadEnv() → initDb() → initMarzban() → initMessageService() → initSettingService()
  → createBot() → startNotificationScheduler(bot, db)
```

## Bot Messages (new keys)

| Key | Purpose |
|---|---|
| `notif_speed_predict` | "با سرعت فعلی مصرف، اکانت {display_name} تا {days} روز و {hours} ساعت دیگر به محدودیت می‌رسد." |
| `notif_low_data` | "حجم باقی‌مانده اکانت {display_name}: {remaining_gb} گیگابایت" |
| `notif_low_time` | "اکانت {display_name} تا {days} روز دیگر منقضی می‌شود." |
| `notif_silenced` | "اعلان‌های این اکانت برای ۳ روز غیرفعال شد." |

## Edge Cases

- **Account with no data_limit (unlimited):** Skip data-related rules (1 & 2). Still evaluate time rule (3).
- **Account with no expire:** Skip time rule (3). Still evaluate data rules (1 & 2).
- **Account created moments ago (near-zero time_since_creation):** Speed calculation would be wildly inaccurate. Skip rule 1 if account age < 24 hours.
- **User is banned/pending:** Pre-filtered by `user.status = approved` query.
- **Marzban API down:** Catch error per-account, log, continue to next. Don't abort the whole batch.
- **Bot restarted mid-interval:** `setInterval` resets. Worst case: a notification is delayed by up to 1 hour. Acceptable.
- **Silence button on old message:** Still works — callback handler validates account ownership, not message age.
