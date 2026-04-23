# Architecture

## System Overview

Currently focused on the Telegram bot. CLI and admin panel are deferred (`TODO.md`).

```
┌─────────────────────────────────────────┐
│            Telegram Bot (Telegraf)       │
│  scenes / handlers / middlewares        │
└────────────────┬────────────────────────┘
                 │
      ┌──────────▼──────────┐
      │     Shared Core     │
      │  src/core/          │
      │  ├── marzban/       │
      │  ├── db/            │
      │  └── utils/         │
      └──────────┬──────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼──────┐ ┌──▼───────┐ ┌──▼──────┐
│ Marzban  │ │PostgreSQL│ │Telegram │
│ Panel    │ │ (Prisma) │ │  API    │
└──────────┘ └──────────┘ └─────────┘
```

---

## Core Layer (`src/core/`)

The core is the only place allowed to talk to external systems. The bot imports from core — never directly hits APIs or DB.

### `src/core/marzban/` — Marzban API Client

Typed wrapper over the Marzban REST API. 44 methods across 7 resource groups.

| Decision | Choice | Reason |
|---|---|---|
| HTTP client | Axios | Interceptors simplify auth retry and error wrapping |
| Auth | Lazy token fetch + in-flight dedup | No startup failures if Marzban is temporarily down |
| Singleton | `initMarzban()` / `getMarzban()` | Class not exported — single instance enforced |
| Key casing | Snake_case (mirrors API) | No silent transformation |
| Errors | `MarzbanError` with `statusCode` | `instanceof` checks + status branching |
| 401 retry | Once, then throw | Handles expiry; hard fails on bad credentials |

### `src/core/db/` — Database Layer

| Decision | Choice | Reason |
|---|---|---|
| ORM | Prisma 7 | Type-safe, migration support, native BigInt |
| Singleton | `initDb()` / `getDb()` | Same pattern as Marzban client |
| Config | `prisma/prisma.config.ts` | Prisma 7 requires config file for connection URL |

**Models:** User, Plan, Account, Payment, BotMessage (see `prisma/schema.prisma`)

### `src/core/utils/` — Shared Utilities

| File | Purpose |
|---|---|
| `config.ts` | Zod env validation — fails fast on missing vars |
| `format.ts` | `toPersianDigits()`, `formatBytes()`, `formatDaysLeft()`, `formatPrice()` |

---

## Bot Layer (`src/bot/`)

### Architecture

```
src/bot/
├── bot.ts              # createBot() — wires everything together
├── main.ts             # Entry point — dotenv, launch, signal handlers
├── context.ts          # BotContext type (session data)
├── scenes/
│   ├── constants.ts    # Scene ID constants
│   ├── start.ts        # /start → register → home
│   ├── home.ts         # Main menu (4 buttons)
│   ├── buyAccount.ts   # Plan list → payment
│   ├── paymentPending.ts # Receipt upload → admin approval
│   ├── manageAccounts.ts # List accounts with live usage
│   ├── viewAccount.ts  # Account detail + config
│   ├── testAccount.ts  # One-time trial (1h/100MB)
│   ├── support.ts      # Contact info
│   ├── error.ts        # Generic error fallback
│   └── index.ts        # createStage() barrel
├── handlers/
│   └── adminPayment.ts # Admin approve/reject callbacks
├── middlewares/
│   └── errorHandler.ts # Global error catch → Persian error message
└── services/
    └── messageService.ts # DB-backed messages with in-memory cache
```

### Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Framework | Telegraf.js | Scene-based navigation, mature ecosystem |
| Session | In-memory (Telegraf default) | Fine for single-process bot |
| Navigation | `ctx.scene.enter()` always | Never leave without entering another scene |
| Messages | DB-backed (`bot_messages` table) | Change text without redeployment |
| Message cache | In-memory Map, 5min TTL | Avoid DB query per interaction |
| Payment | Manual admin approval | Admin gets receipt photo, taps approve/reject |
| Test accounts | 1 hour, 100MB, one per user | Checked via `user.has_test` flag |
| Language | Persian (فارسی) | All user-facing text from DB |
| Marzban usernames | `{type}_{chatId}_{timestamp}` | Unique, traceable, no collisions |

### Scene Flow (FSM)

```
/start → START → HOME
                  ├── BUY_ACCOUNT → PAYMENT_PENDING → (admin approve) → account created
                  ├── MANAGE_ACCOUNTS → VIEW_ACCOUNT
                  ├── TEST_ACCOUNT → (provision) → config delivered
                  ├── SUPPORT
                  └── ERROR → HOME
```

### Bot Startup Sequence

```
1. loadEnv()          → validate all env vars (Zod)
2. initDb()           → Prisma singleton
3. initMarzban()      → Marzban client singleton
4. initMessageService() → message cache singleton
5. createBot()        → Telegraf instance + session + stage + middleware
6. bot.launch()       → start polling
```

---

## Data Model

5 tables in PostgreSQL (defined in `prisma/schema.prisma`):

| Table | Key Fields | Purpose |
|---|---|---|
| `users` | chat_id (BigInt unique), has_test | Telegram users |
| `plans` | name, data_limit, duration_days, price, is_active | VPN plan catalog |
| `accounts` | user_id, marzban_username, type (paid/test) | Provisioned VPN accounts |
| `payments` | user_id, plan_id, status, receipt_file_id, reviewed_by | Payment lifecycle |
| `bot_messages` | key (unique), text | Dynamic bot text |

---

## Error Strategy

- **Marzban errors:** `MarzbanError` with `statusCode` — callers branch on status
- **DB errors:** Prisma errors propagate, caught by error middleware
- **Bot errors:** `errorHandler` middleware catches all, sends `error.message` from DB
- **Validation:** Zod at system boundaries (env vars, future: user input)

---

## Testing

| Layer | Tests | Strategy |
|---|---|---|
| `core/marzban` | 76 | Mock axios interceptors |
| `core/db` | 4 | Singleton lifecycle |
| `core/utils` | 14 | Unit tests (format, config) |
| `bot/services` | 9 | Mock Prisma, test cache + placeholders |
| **Total** | **103** | All via Vitest |

---

## Environment Variables

```
DATABASE_URL          PostgreSQL connection string
TELEGRAM_BOT_TOKEN    Telegraf bot token
MARZBAN_API_URL       Marzban panel base URL
MARZBAN_USERNAME      Marzban admin username
MARZBAN_PASSWORD      Marzban admin password
ADMIN_CHAT_ID         Admin Telegram chat ID (payment approvals)
CARD_NUMBER           Bank card number (payment instructions)
SUPPORT_USERNAME      Support Telegram handle
```

---

## Commit Convention

```
feat(core|bot): description
fix(core|bot): description
chore: description
```
