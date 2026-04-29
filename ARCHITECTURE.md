# Architecture — Announcements

## New Models

### `Announcement`
Admin-created broadcast message. Stored in DB for history and delivery tracking.

| Field | Type | Notes |
|---|---|---|
| id | Int (PK) | Auto-increment |
| text | String | The announcement body (HTML allowed for bold/italic) |
| target_type | Enum: `all`, `plan_group` | Who receives it |
| target_plan_group_id | Int? | Only set when `target_type = plan_group` |
| total_recipients | Int | Count of users targeted at send time |
| delivered_count | Int | Successfully sent (updated as delivery progresses) |
| failed_count | Int | Failed sends (updated as delivery progresses) |
| status | Enum: `sending`, `completed`, `cancelled` | Broadcast lifecycle |
| created_by | BigInt | Admin chat_id who created it |
| created_at | DateTime | |
| completed_at | DateTime? | When all sends finished |

### `AnnouncementDelivery`
Per-user delivery tracking. One row per (announcement, user) pair.

| Field | Type | Notes |
|---|---|---|
| id | Int (PK) | Auto-increment |
| announcement_id | Int (FK) | |
| user_id | Int (FK) | |
| status | Enum: `pending`, `sent`, `failed` | |
| error | String? | Telegram API error if failed |
| sent_at | DateTime? | |

**Index:** `(announcement_id, status)` — for progress queries and retry logic.

## New Service: `announcementService`

Handles the broadcast mechanics. Lives in `src/core/announcement/`.

```
announcementService
  ├── createAnnouncement(text, targetType, targetPlanGroupId?) → Announcement
  ├── startBroadcast(announcementId) → void (kicks off async delivery)
  ├── getAnnouncement(id) → Announcement + delivery stats
  ├── listAnnouncements(page) → Announcement[]
  └── cancelBroadcast(announcementId) → void
```

### Broadcast Mechanics

1. **`createAnnouncement`** — saves the announcement, queries target users, bulk-inserts `AnnouncementDelivery` rows with `status = pending`.
2. **`startBroadcast`** — processes pending deliveries in batches:
   - Fetch next batch of `pending` deliveries (batch size: 25)
   - Send via `telegram.sendMessage(chat_id, text, { parse_mode: 'HTML' })`
   - Update each delivery row to `sent` or `failed`
   - Increment `delivered_count` / `failed_count` on the announcement
   - Sleep ~1 second between batches (stay under Telegram's 30/sec limit)
   - Repeat until no pending deliveries remain
   - Set announcement `status = completed`, record `completed_at`
3. **`cancelBroadcast`** — sets remaining `pending` deliveries to `failed` (error: "cancelled"), marks announcement as `cancelled`.

### Rate Limiting Strategy

Telegram allows ~30 messages/second to different users. We use a conservative 25/sec with 1-second pauses between batches. This means:
- 1,000 users ≈ 40 seconds
- 10,000 users ≈ 7 minutes

The broadcast runs in-process (no external job queue). The bot remains responsive during broadcast since sends are async with `await` + sleep between batches.

### Error Handling

- **User blocked the bot:** Mark delivery as `failed`, error = "bot blocked". Common and expected.
- **Rate limit (429):** Back off for the duration Telegram specifies in `retry_after`, then resume.
- **Other API errors:** Mark delivery as `failed`, log the error, continue to next user.
- **Bot restart during broadcast:** On startup, check for announcements with `status = sending` and resume from remaining `pending` deliveries.

## New BotSetting

| Key | Values | Default | Purpose |
|---|---|---|---|
| `channel_check_enabled` | `"true"` / `"false"` | `"true"` | When `"false"`, skip `channelCheck` middleware |

### channelCheck Middleware Change

```typescript
// Current: always checks if CHANNEL_ID is set
// New: also checks channel_check_enabled setting
const enabled = await getSetting('channel_check_enabled')
if (enabled === 'false') return next()
```

This is a minimal change — one early-return added to the existing middleware.

## Key Relationships

```
Announcement → AnnouncementDelivery[] (one-to-many)
Announcement → PlanGroup (optional, for targeted sends)
AnnouncementDelivery → User (many-to-one)
```

## Startup Sequence Change

No change needed. The broadcast resume check can run after `createBot()` returns, before `bot.launch()`.
