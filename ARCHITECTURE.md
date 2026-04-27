# Architecture

## Models

### `User`
Telegram user. Self-registers via deep link (`/start=<code>`). Has `plan_group_id` set from deep link and `bank_card_id` assigned randomly from active cards at registration time.

### `Seller`
Trusted reseller added by admin via chat ID. Can exist before the person starts the bot (`user_id = null`). Linked to `User` on first `/start`.

### `SellerPlan`
Per-seller pricing tiers. Admin creates/manages these. Each plan has name, data_limit (bytes), and price (Toman). Duration is fixed at 30 days — not stored per-plan.

### `PlanGroup`
Defines a set of plans available to users who register with a specific deep link code. Two types:
- **`per_gb`**: User picks GB count, price = count × `price_per_gb`. No Plan records needed.
- **`fixed`**: Pre-defined Plan records with fixed data_limit and price.

Each group has a unique `code` — first segment of a UUIDv4 (8 hex chars, e.g. `a1b2c3d4`), auto-generated when admin creates the group. Used in the deep link: `t.me/bot?start=<code>`.

### `Plan`
Belongs to a `PlanGroup` of type `fixed`. Has name, data_limit, duration_days, price, is_active.

### `BankCard`
Admin-managed bank cards for payment. Multiple cards supported. Randomly assigned to users at registration. Stores card_number (no dashes), holder_name, bank_name (optional), is_active flag.

### `Payment`
Tracks a user's purchase attempt. Status flow: `pending` → `awaiting_approval` → `approved` / `rejected`. Stores `bank_card_id` to record which card was shown for this payment (financial tracking). Also stores receipt_file_id (Telegram photo), reviewed_by (admin chat_id).

### `Account`
VPN account provisioned in Marzban. Two creation paths:
- **User buy flow:** created after admin approves payment
- **Seller flow:** created instantly by seller, payment tracked via `payment_status`

Has `seller_id`, `seller_plan_id`, `payment_status` (unpaid/paid), `note` (searchable by seller). All nullable — non-seller accounts unaffected.

### `BotSetting`
Key-value runtime feature flags. Cached in-memory with 30s TTL. No restart needed to toggle features.

### `BotMessage`
User-facing text templates. All bot messages come from DB, never hardcoded. Supports `{placeholder}` interpolation.

## Key Relationships

```
User → PlanGroup (many-to-one: determines which plans user sees)
User → BankCard (many-to-one: randomly assigned at registration)
User → Account[] (user's VPN accounts)
User → Payment[] (user's purchase attempts)
PlanGroup → Plan[] (fixed groups have pre-defined plans)
Payment → BankCard (which card received this payment — financial tracking)
Payment → Plan (nullable — null for per_gb purchases)
Seller → User (optional, linked on /start)
Seller → SellerPlan[] (per-seller pricing)
Seller → Account[] (accounts created by this seller)
Account → SellerPlan (tracks which plan = how much is owed)
BankCard → User[] (which users are assigned this card)
BankCard → Payment[] (which payments were directed to this card)
```

## Self-Registration via Deep Link

Users register themselves. No admin gate.

```
User opens t.me/bot?start=<code>
  → Bot receives /start <code>
  → Look up PlanGroup by code
  → If invalid code → show error, stop
  → Create User record:
      - chat_id, first_name, last_name, username from Telegram
      - plan_group_id from matched group
      - bank_card_id = random active card
  → Transition to HOME
```

**Returning user:** If user already exists, update profile fields, go to HOME. Plan group is NOT changed on re-start (locked at registration).

**No valid deep link:** If someone sends bare `/start` without a code (and isn't registered), show error message asking them to use the correct link.

## Bank Card System

Cards are admin-managed via the ADMIN_BANK_CARDS scene. Assigned randomly to users at registration.

```
Admin adds card (number, holder, bank) → BankCard record
User registers via deep link → random active card assigned → User.bank_card_id set
User buys → sees their assigned card in payment instructions
Payment record stores bank_card_id for financial tracking
```

**Display format:** Card number shown with dashes for readability (`6037-XXXX-XXXX-XXXX`). Stored without dashes in DB.

**Fallback:** If user has no assigned card (edge case — all cards deactivated after registration) → block purchase, show error.

**Random assignment:** Pick a random card from active cards. If no active cards exist at registration time → still create user but with `bank_card_id = null`. Admin must add a card and reassign later.

## Financial Tracking

Every Payment records `bank_card_id` — the card shown to the user for that specific purchase. This enables:
- Total revenue per card
- Which users paid to which card
- Card-level financial reporting

Even if user's assigned card changes later, historical payments still reference the original card.

## Plan Groups — Concrete Setup

Codes are auto-generated (first 8 chars of UUIDv4). Examples below use placeholder codes.

### Group 1: Per-GB (`code: e.g. "f47ac10b"`)
- Type: `per_gb`
- `price_per_gb`: 300 (Toman)
- `duration_days`: 30
- User picks GB count (1–100) → price = count × 300
- Deep link: `t.me/doveng_bot?start=f47ac10b`

### Group 2: Fixed Packages (`code: e.g. "7c9e6679"`)
- Type: `fixed`
- Plans:
  - 5GB — 600 Toman — 30 days
  - 10GB — 1,100 Toman — 30 days
- Deep link: `t.me/doveng_bot?start=7c9e6679`

Codes are generated at group creation time via `crypto.randomUUID().split('-')[0]`.

## Seller Identity Resolution

```
Admin adds by chat_id → Seller record (user_id = null)
Person /starts bot → match by chat_id → link user_id, fill name/username from Telegram
```

## Seller Marzban Username Format

`s_` + 6 random lowercase alphanumeric (e.g. `s_a8f3k2`). Short, anonymous.

## Role Detection in HOME Scene

- **Admin:** Compare `chat_id` with `ADMIN_CHAT_ID` env var
- **Seller:** Query `sellers` table by `chat_id` where `is_active = true`
- **User:** Must exist in `users` table (self-registered via deep link)
- Buttons conditionally rendered — non-matching users never see them

## Buy Flow Gate

`buy_enabled` BotSetting controls the "خرید اکانت" button. When `"false"` → inline toast, no scene transition. Seeded as `"false"` by default.

## Services

### `settingService`
Same singleton pattern as `messageService`. In-memory cache with 30s TTL. All values are strings.

```typescript
initSettingService(db)
getSetting('buy_enabled')  // → "true" | "false"
```

### `messageService`
DB-backed message templates with `{placeholder}` interpolation. Cached with 30s TTL.

## Startup Sequence

```
loadEnv() → initDb() → initMarzban() → initMessageService() → initSettingService() → createBot()
```
