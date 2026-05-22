# Event Tracking — Telegram Log Group

## 1. Goal

Every meaningful action that happens inside the bot is mirrored, in real time, to a dedicated Telegram **forum supergroup** organized by topic. The admin gets a complete, chronological audit trail of user activity, admin actions, seller actions, payments, account lifecycle changes, errors, and system events — without needing to query the database or read server logs.

The log group is the *only* sink: there is no DB persistence, no replay, no retention enforcement from the bot side.

---

## 2. Non-Goals

- **No DB persistence.** No new Prisma model, no migration. Telegram is the only store of record.
- **No retry / replay.** Sends are fire-and-forget. If Telegram is down or rate-limits us, the event is lost. Re-evaluate only if this becomes a real operational problem.
- **No event-history UI in the bot.** Users (including the admin) read events directly in Telegram.
- **No localization of event strings.** Event log copy is admin-internal — format strings live inline in `eventFormat.ts`. This is an intentional, documented deviation from the "no hardcoded strings" rule, which applies to user-facing copy.
- **No scene-transition noise.** We do **not** log every intermediate `editMessageText` redraw, scene `enter`, or session mutation. Only user-initiated actions and business events.
- **No PII masking.** Chat IDs, names, Marzban usernames, and card numbers appear in clear text. The log group is private to the admin.

---

## 3. Environment Variables

Add to `.env.example` and validate via the Zod schema in `src/core/utils/config.ts`. Missing values must fail boot.

| Var | Required | Purpose |
|---|---|---|
| `LOG_GROUP_ID` | yes | Supergroup ID (must be a **forum**). Bot must be admin in the group with permission to send messages and manage topics. Negative integer (e.g. `-1001234567890`). |
| `LOG_TOPIC_USERS` | yes | `message_thread_id` for user lifecycle events. |
| `LOG_TOPIC_PAYMENTS` | yes | `message_thread_id` for transactions, payments, Premzy callbacks. |
| `LOG_TOPIC_ACCOUNTS` | yes | `message_thread_id` for Marzban account create/renew/delete. |
| `LOG_TOPIC_ADMIN` | yes | `message_thread_id` for admin actions. |
| `LOG_TOPIC_SELLER` | yes | `message_thread_id` for seller actions. |
| `LOG_TOPIC_ERRORS` | yes | `message_thread_id` for caught errors and channel-check failures. |
| `LOG_TOPIC_SYSTEM` | yes | `message_thread_id` for bot startup/shutdown and Marzban API failures. |

---

## 4. Feature Flag

| Key | Values | Default | Purpose |
|---|---|---|---|
| `events_enabled` | `"true"` / `"false"` | `"true"` | Master kill-switch. When `"false"`, `logEvent(...)` returns immediately without touching Telegram. |

Stored in `bot_settings` and read through the existing `getSetting()` helper in `src/bot/services/settingService.ts` (30s TTL cache). Add a seeder entry alongside the existing flags (`buy_enabled`, `test_enabled`, `renew_enabled`, `payment_method`).

---

## 5. Event Categories & Topic Mapping

Every event carries a `category`, which determines the `message_thread_id`:

| Category | Topic env var | Emoji | Examples |
|---|---|---|---|
| `USER` | `LOG_TOPIC_USERS` | 👤 | `/start`, registration request, channel-check fail, home menu clicks |
| `ADMIN` | `LOG_TOPIC_ADMIN` | 🛡️ | user approve/reject, bank card CRUD, plan group CRUD, seller CRUD |
| `SELLER` | `LOG_TOPIC_SELLER` | 🏷️ | seller account create, financial report viewed, account deleted |
| `PAYMENT` | `LOG_TOPIC_PAYMENTS` | 💳 | transaction created, receipt uploaded, premzy callback, approve/reject |
| `ACCOUNT` | `LOG_TOPIC_ACCOUNTS` | 📦 | marzban account created, renewed, deleted, test provisioned, renamed |
| `ERROR` | `LOG_TOPIC_ERRORS` | 🔥 | global error handler catch, channel-check denial, marzban 4xx/5xx, premzy signature invalid |
| `SYSTEM` | `LOG_TOPIC_SYSTEM` | ⚙️ | bot start, SIGINT/SIGTERM, admin bootstrap |

---

## 6. Tracked Event Types

### USER
- `user.start_command` — `/start` invoked. Payload: `deepLinkCode?`, `status` (pending/approved/banned).
- `user.registration_requested` — new pending user created. Payload: `chatId`, `firstName`, `lastName`, `username?`.
- `user.channel_check_failed` — approved user not in `CHANNEL_ID`.
- `user.home_button_clicked` — top-level menu click. Payload: `button` (buy / test / manage / support / seller / admin_panel).

### ADMIN
- `admin.user_approve_clicked` — approve button pressed (before card selection).
- `admin.user_card_toggled` — card selection toggled. Payload: `cardId`, `action` (add/remove).
- `admin.user_approval_confirmed` — final approval with selected card list.
- `admin.user_rejected` — user banned.
- `admin.bank_card_created` / `admin.bank_card_updated` / `admin.bank_card_deleted`.
- `admin.plan_group_created` / `admin.plan_group_updated` / `admin.plan_group_deleted`.
- `admin.seller_created` / `admin.seller_activated` / `admin.seller_deactivated` / `admin.seller_plans_changed`.
- `admin.account_created_manually` — admin used the `admin.create_account` scene.
- `admin.account_edited` / `admin.account_deleted`.

### SELLER
- `seller.account_created` — via `sellerCreateAccount` scene.
- `seller.account_deleted` / `seller.account_disabled`.
- `seller.report_viewed`.

### PAYMENT
- `payment.transaction_created` — buy or renew transaction inserted. Payload: `txnId`, `amount`, `method` (premzy/manual), `type` (buy/renew).
- `payment.receipt_uploaded` — user sent payment photo (manual flow).
- `payment.admin_approved` / `payment.admin_rejected`.
- `payment.premzy_checkout_created` — JWT URL issued. Payload: `orderId`, `amount`.
- `payment.premzy_callback_received` — webhook arrived. Payload: `orderId`, `status`, `signatureValid`.

### ACCOUNT
- `account.created` — payload: `marzbanUsername`, `plan`, `type` (paid/test), `ownerSellerId`, `expiresAt`.
- `account.renewed` — payload: `marzbanUsername`, `oldExpiry`, `newExpiry`, `accumulatedGb`.
- `account.deleted` — payload: `marzbanUsername`, `triggeredBy` (user/admin/seller).
- `account.renamed` — payload: `marzbanUsername`, `oldName`, `newName`.
- `account.test_provisioned` — special-cased due to `has_test` gate. Payload: `marzbanUsername`.

### ERROR
- `error.handler_caught` — global `errorHandler` middleware catch. Payload: `message`, `stack` (first 800 chars), `updateType`.
- `error.marzban_api` — non-2xx from Marzban. Payload: `endpoint`, `method`, `status`, `body` (truncated).
- `error.premzy_signature_invalid` — webhook signature check failed. Payload: `orderId`, `remoteIp`.

### SYSTEM
- `system.bot_started` — payload: `version` (from `package.json`), `nodeEnv`.
- `system.bot_stopping` — SIGINT/SIGTERM received.
- `system.admin_bootstrapped` — admin Seller record auto-created on first boot.

---

## 7. Architecture

```
src/
├── core/
│   └── events/
│       ├── types.ts            # EventCategory enum, EventType discriminated union, EventPayload<T>
│       ├── eventFormat.ts      # formatEvent(type, payload) -> HTML string. One pure function per event type.
│       └── eventLogger.ts      # logEvent(type, payload). Picks topic via type->category map.
│                               #   Reads events_enabled. Fire-and-forget. Swallows errors via console.error.
├── bot/
│   ├── bot.ts                  # Injects Telegraf instance into eventLogger module on startup.
│   ├── main.ts                 # Emits system.bot_started / system.bot_stopping.
│   ├── middlewares/
│   │   ├── errorHandler.ts     # Extended: emits error.handler_caught before swallowing/rethrowing.
│   │   ├── channelCheck.ts     # Extended: emits user.channel_check_failed on denial.
│   │   └── eventLogger.ts      # NEW. Logs user.start_command, user.home_button_clicked.
│   │                           #   Registered after errorHandler, before channelCheck.
│   ├── scenes/                 # logEvent(...) inserted at business-event call sites (see §10).
│   └── handlers/
│       ├── adminUserApproval.ts  # logEvent for admin.user_* events
│       └── adminPayment.ts       # logEvent for payment.admin_* events
└── premzy/
    └── server.ts               # logEvent for payment.premzy_* and error.premzy_signature_invalid
```

`eventLogger.ts` exports:

```ts
export function setBotInstance(bot: Telegraf): void;  // called once from bot.ts on startup
export function logEvent<T extends EventType>(type: T, payload: EventPayload<T>): void;  // fire-and-forget
```

---

## 8. Event Message Format

One Telegram message per event, HTML parse mode, sent to `LOG_GROUP_ID` with `message_thread_id` matching the event's category.

Template:

```
{emoji} <b>{eventType}</b>
👤 user: <a href="tg://user?id={chatId}">{name}</a> (<code>{chatId}</code>)
🕒 {YYYY-MM-DD HH:mm:ss} Tehran

{key}: {value}
{key}: {value}
...
```

The `user:` line is omitted for `SYSTEM` events that have no associated user.

Example — `payment.admin_approved`:

```
💳 <b>payment.admin_approved</b>
👤 user: <a href="tg://user?id=123456">Ali</a> (<code>123456</code>)
🕒 2026-05-23 14:33:10 Tehran

txn_id: 7f3b…e1
amount: 150,000 IRR
plan: 30GB / 30d
approved_by: admin
marzban_username: user_abc123
```

Example — `error.handler_caught`:

```
🔥 <b>error.handler_caught</b>
👤 user: <a href="tg://user?id=123456">Ali</a> (<code>123456</code>)
🕒 2026-05-23 14:33:10 Tehran

update_type: callback_query
message: Cannot read properties of undefined (reading 'id')
stack:
<pre>at handleApprove (src/bot/handlers/adminUserApproval.ts:42:18)
at ...</pre>
```

---

## 9. Failure & Performance Handling

- **Fire-and-forget:** every call site invokes `logEvent(...)` *without* `await`. The function itself is `async` internally but returns immediately to callers — implemented as `void logEvent(...)` or as a sync function that schedules the send.
- **Error swallowing:** internal `try/catch` around the Telegram call. On failure: `console.error({ err, eventType }, 'eventLogger failed')` and return silently. **Failed event sends must never break user flows.**
- **Kill switch:** if `getSetting('events_enabled') !== "true"`, return immediately without touching Telegram.
- **Bot not ready:** if `setBotInstance()` has not been called yet (e.g. very early startup error), `logEvent` falls back to `console.warn` and returns.
- **Telegram rate limit (20 msg/min/group):** no batching, no queue in v1. If hit, sends fail and are swallowed. Re-evaluate only if observed in production.

---

## 10. Implementation Order

Each step is independently testable. Do not skip ahead.

1. **Env & config**
   - Add the 8 new vars to `.env.example`.
   - Extend Zod schema in `src/core/utils/config.ts`.
   - Verify the app fails boot when any var is missing.

2. **Feature flag**
   - Add `events_enabled = "true"` to the BotSetting seeder.
   - No code reads it yet.

3. **Core types**
   - `src/core/events/types.ts`: `EventCategory` enum, discriminated `EventType` union covering every event in §6, `EventPayload<T>` generics.

4. **Formatters**
   - `src/core/events/eventFormat.ts`: one pure function per event type. Returns HTML string per §8.
   - Snapshot tests in `src/__tests__/core/events/eventFormat.test.ts` — one snapshot per event type with a representative payload.

5. **Logger**
   - `src/core/events/eventLogger.ts`: `setBotInstance`, `logEvent`, internal type→category map, topic lookup.
   - Tests in `src/__tests__/core/events/eventLogger.test.ts`:
     - asserts correct `chat_id`, `message_thread_id`, `parse_mode: 'HTML'`
     - asserts no-op when `events_enabled === "false"`
     - asserts errors swallowed (Telegraf throws → no exception to caller)
     - asserts `console.warn` fallback when bot instance not set

6. **Wire bot instance** — in `src/bot/bot.ts` startup, call `setBotInstance(bot)` once.

7. **Middleware**
   - `src/bot/middlewares/eventLogger.ts`: logs `user.start_command` and `user.home_button_clicked` (filter by `callback_data` prefix list).
   - Register **after** `errorHandler`, **before** `channelCheck` in `src/bot/bot.ts`.
   - Extend `channelCheck` to emit `user.channel_check_failed`.
   - Extend `errorHandler` to emit `error.handler_caught` before its existing behavior.

8. **Business-event call sites** — insert `void logEvent(...)` in:
   - `src/bot/scenes/start.ts` — `user.registration_requested`
   - `src/bot/scenes/buyAccount.ts`, `renewAccount.ts` — `payment.transaction_created`, `payment.premzy_checkout_created`
   - `src/bot/scenes/testAccount.ts` — `account.test_provisioned`
   - `src/bot/scenes/manageAccounts.ts`, `viewAccount.ts` — `account.deleted`, `account.renamed`
   - `src/bot/scenes/paymentPending.ts` — `payment.receipt_uploaded`
   - `src/bot/scenes/sellerCreateAccount.ts` — `seller.account_created`, `account.created`
   - `src/bot/scenes/sellerAccounts.ts`, `sellerViewAccount.ts` — `seller.account_deleted`, `seller.account_disabled`
   - `src/bot/scenes/sellerReport.ts` — `seller.report_viewed`
   - `src/bot/scenes/adminBankCards.ts`, `adminPlanGroups.ts`, `adminSellers.ts`, `adminSellerDetail.ts`, `adminSellerPlans.ts`, `adminUsers.ts` — corresponding admin events
   - `src/bot/scenes/adminAccounts.ts`, `adminViewAccount.ts` — `admin.account_created_manually`, `admin.account_edited`, `admin.account_deleted`, `account.created`
   - `src/bot/handlers/adminUserApproval.ts` — `admin.user_approve_clicked`, `admin.user_card_toggled`, `admin.user_approval_confirmed`, `admin.user_rejected`
   - `src/bot/handlers/adminPayment.ts` — `payment.admin_approved`, `payment.admin_rejected`, `account.created` (on provisioning), `account.renewed` (on renew)
   - `src/premzy/server.ts` — `payment.premzy_callback_received`, `error.premzy_signature_invalid`

9. **System events** — emit `system.bot_started` and `system.bot_stopping` in `src/bot/main.ts`. Emit `system.admin_bootstrapped` where the admin Seller record is auto-created.

10. **Marzban error wrapping** — in the Marzban client, on non-2xx responses, emit `error.marzban_api` before throwing.

11. **Docs**
    - `ARCHITECTURE.md`: add an entry explaining the inline-format-string deviation and the fire-and-forget contract.
    - `RECAP.md`: write summary.

12. **Commit**
    - `feat(bot): event tracking to telegram log group`
    - One commit. Scope: `bot`.

---

## 11. Verification

1. Create a Telegram **forum supergroup**, add 7 topics matching the categories in §5, copy topic IDs into `.env`. Add the bot as admin.
2. `yarn lint` — zero errors.
3. `yarn test` — zero failures.
4. `yarn dev` (or your standard run command).
5. Confirm `system.bot_started` appears in the **SYSTEM** topic.
6. From a fresh, non-admin Telegram account:
   - Open `t.me/<bot>?start=<code>` → **USER** topic shows `user.start_command` and `user.registration_requested`.
   - Admin approves the user with a card → **ADMIN** topic shows `admin.user_approve_clicked`, `admin.user_card_toggled`, `admin.user_approval_confirmed`.
   - User clicks "خرید اکانت" → **USER** topic shows `user.home_button_clicked` (button=buy).
   - User completes buy flow (manual) → **PAYMENT** topic shows `payment.transaction_created` and `payment.receipt_uploaded`; admin approves → `payment.admin_approved`; **ACCOUNT** topic shows `account.created`.
   - User renews → `payment.transaction_created` (type=renew) + `account.renewed`.
   - User triggers a forced error (e.g. Marzban returns 500) → **ERROR** topic shows `error.handler_caught` and/or `error.marzban_api`.
7. Set `events_enabled = "false"` in `bot_settings` → confirm new actions do **not** produce log messages (after the 30s setting cache TTL).
8. Send the bot `SIGTERM` → **SYSTEM** topic shows `system.bot_stopping`.
