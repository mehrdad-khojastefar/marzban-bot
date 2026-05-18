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
         → initErrorReporter(bot.telegram, env.ERROR_CHAT_ID)
         → registerProcessHandlers()    // uncaughtException, unhandledRejection (no-exit)
         → bot.launch()
```

The sub and premzy entrypoints follow the same pattern: build a `Telegram`
client, call `initErrorReporter`, register process handlers, then start
their HTTP server.

## Error Reporting

All runtime errors are forwarded to a private Telegram group for triage,
in addition to existing `console.error` logging. The process never exits
on errors — reporting is best-effort and non-fatal.

### Sources of errors captured
1. **Bot handler errors** — caught by `bot/middlewares/errorHandler.ts`,
   delegated to `errorReporter` after the user-facing reply.
2. **Process-level errors** — `process.on('uncaughtException')` and
   `process.on('unhandledRejection')` registered in each entrypoint
   (`src/bot/main.ts`, `src/sub/main.ts`, `src/premzy/main.ts`). Handler
   reports the error and returns; the process keeps running. Node's
   default-exit behavior is explicitly overridden.
3. **Sub server errors** (`src/sub/`) — the HTTP request handler's
   `catch` block delegates to the reporter, then responds 502.
4. **Premzy callback server errors** (`src/premzy/`) — same pattern as sub.

### `errorReporter` service (`src/core/utils/errorReporter.ts`)
Singleton initialized at startup with a Telegraf `Telegram` client and
the target chat id. Exposes:

```typescript
initErrorReporter(opts: { telegram: Telegram; chatId: string; env: string; enabled?: boolean })
reportError(err: unknown, context?: ErrorContext): Promise<void>
registerProcessHandlers(source: 'bot' | 'sub' | 'premzy'): void
```

Shared across `bot`, `sub`, and `premzy` — initialized once per
entrypoint, imported wherever needed.

### Payload format
Single Telegram message in `<pre>` HTML mode:
- Header: `🚨 [<env>] <source>: <ErrorName>: <message>`
  (`source` = `bot` | `sub` | `premzy` | `process`)
- Context block (user id, scene, callback data, route, etc. — whichever apply)
- Full `err.stack` (or `util.inspect(err)` if no stack)
- Cause chain via `err.cause` walked recursively (max depth 5)

Messages longer than ~3,800 chars are split across multiple messages to
stay under Telegram's 4,096-char limit; each part tagged `(1/N)`.

### Failure isolation
`reportError` MUST never throw. All `sendMessage` calls are wrapped in
`try/catch` and on failure fall back to `console.error('errorReporter failed', e)`.
The reporter never cascades into the error path it serves.

### Rate limiting & dedupe
- In-memory map keyed by `errorName + first stack frame`, TTL 60s.
- Repeats within TTL increment a counter; on eviction a single
  "×N suppressed" summary is sent.
- Hard ceiling: 30 reports/minute. Excess dropped with a counter log.

### Environment variables (new)
| Var | Required | Purpose |
|---|---|---|
| `ERROR_CHAT_ID` | no | Telegram group id (e.g. `-1001234567890`). If unset, reporter no-ops with a startup warning. |
| `ERROR_REPORTING_ENABLED` | no (default `"true"`) | Kill-switch — set to `"false"` to disable without removing the chat id. |
