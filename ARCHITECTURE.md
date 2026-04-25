# Architecture — Seller System MVP

## New Models

### `Seller`
Trusted reseller added by admin via chat ID. Can exist before the person starts the bot (`user_id = null`). Linked to `User` on first `/start`.

### `SellerPlan`
Per-seller pricing tiers. Admin creates/manages these. Each plan has name, data_limit (bytes), and price (Toman). Duration is fixed at 30 days — not stored per-plan.

### `BotSetting`
Key-value runtime feature flags. Cached in-memory with 30s TTL. No restart needed to toggle features.

### `Account` (modified)
Added `seller_id`, `seller_plan_id`, `payment_status` (unpaid/paid), and `note` (searchable by seller). All nullable — existing non-seller accounts unaffected.

## Key Relationships

```
Seller → User (optional, linked on /start)
Seller → SellerPlan[] (per-seller pricing)
Seller → Account[] (accounts created by this seller)
Account → SellerPlan (tracks which plan = how much is owed)
```

## New Service: `settingService`

Same singleton pattern as `messageService`. In-memory cache with 30s TTL. All values are strings — callers interpret.

```typescript
initSettingService(db)  // once at startup
getSetting('buy_enabled')  // → "true" | "false"
```

## Seller Identity Resolution

```
Admin adds by chat_id → Seller record (user_id = null)
Person /starts bot → match by chat_id → link user_id, fill name/username from Telegram
```

## Seller Marzban Username Format

`s_` + 6 random lowercase alphanumeric (e.g. `s_a8f3k2`). Short, anonymous — seller's customers don't map to bot users.

## Role Detection in HOME Scene

- **Seller:** Query `sellers` table by `chat_id` where `is_active = true`
- **Admin:** Compare `chat_id` with `ADMIN_CHAT_ID` env var
- Buttons conditionally rendered — non-matching users never see them

## Buy Flow Gate

`buy_enabled` BotSetting controls the "خرید اکانت" button. When `"false"` → inline toast, no scene transition. Seeded as `"false"` by default.

## Startup Sequence Change

Add `initSettingService()` after `initMessageService()`, before `createBot()`.
