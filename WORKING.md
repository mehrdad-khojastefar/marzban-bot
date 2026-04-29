# Announcements Feature

## Goal

Add an admin broadcast system so the admin can send announcements directly to bot users — eliminating the need for a separate Telegram channel.

## Requirements

### Core
- Admin can compose and broadcast a text message to all **approved** users
- Messages are sent as new Telegram messages (not edits — users need to see them as notifications)
- Delivery is tracked per-user: which users received it, which failed
- Rate-limited to respect Telegram's ~30 msg/sec API limit
- Admin can view past announcements and their delivery stats

### Targeting
- **All approved users** (default)
- **By plan group** — send only to users in a specific plan group
- Future: more filters (by registration date, active accounts, etc.)

### Channel Dependency Removal
- The `channelCheck` middleware currently forces users to join an external channel
- With announcements, admin can reach users directly — the channel becomes optional
- Add a `channel_check_enabled` BotSetting (default `"true"` for backward compat)
- When `"false"`, skip the channel membership check entirely

### Non-Goals (this iteration)
- Scheduled announcements (send later)
- Rich media announcements (photos, videos) — text only for now
- User-level opt-out from announcements
