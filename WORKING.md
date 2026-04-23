# Telegram VPN Bot (Marzban Integration)

## Overview

A Persian-language Telegram bot for selling and managing VPN accounts via Marzban. Focused on the bot interface only — CLI and admin panel are deferred (see `TODO.md`).

---

## Decisions

| Topic | Decision |
|---|---|
| Language | Persian (فارسی) |
| Payment | Manual admin approval (no gateway) |
| Plans | DB-based (seeded, managed via DB) |
| Test accounts | 1 hour, 100MB, one per user |
| Bot messages | DB-backed (`bot_messages` table) — editable without redeployment |
| VPN backend | Marzban API (service already built in `src/core/marzban/`) |

---

## Project Structure

```
src/
├── bot/
│   ├── scenes/          # Telegraf scenes (one per feature)
│   ├── handlers/        # Command and callback handlers
│   ├── middlewares/      # Auth, rate limiting, error handling
│   └── services/        # Bot-specific services (message resolver, etc.)
├── core/
│   ├── marzban/         # ✅ Marzban API client (done)
│   ├── db/              # Prisma client, repositories
│   └── utils/           # Shared helpers
└── db/
    ├── migrations/
    └── seeds/           # Default plans, bot messages
```

---

## Scene System (FSM)

Each scene has a design file at `design/bot/scenes/<scene>.md`.

### States

```
START → HOME → BUY_ACCOUNT → PAYMENT_PENDING → ACCOUNT_PROVISIONING → ACCOUNT_READY
                HOME → MANAGE_ACCOUNTS → VIEW_ACCOUNT
                HOME → TEST_ACCOUNT
                HOME → SUPPORT
                * → ERROR → HOME
```

### Scene Files

| Scene | Design | Purpose |
|---|---|---|
| Start | `design/bot/scenes/start.md` | `/start` entry, registration |
| Home | `design/bot/scenes/home.md` | Main menu |
| Buy Account | `design/bot/scenes/buy_account.md` | Plan selection |
| Payment Pending | `design/bot/scenes/payment_pending.md` | Receipt upload, admin approval |
| Manage Accounts | `design/bot/scenes/manage_accounts.md` | List user's accounts |
| View Account | `design/bot/scenes/view_account.md` | Account detail + config |
| Test Account | `design/bot/scenes/test_account.md` | One-time trial (1h/100MB) |
| Support | `design/bot/scenes/support.md` | Contact info |
| Error | `design/bot/scenes/error.md` | Error fallback |

---

## Bot Messages

All user-facing text is stored in the `bot_messages` DB table. See `design/bot/messages.md` for the full registry, placeholder system, and caching strategy.

---

## Data Model

### User
```
id            serial
chat_id       bigint (unique)
username      varchar (nullable)
first_name    varchar
last_name     varchar (nullable)
has_test      boolean (default: false)
created_at    timestamp
```

### Plan
```
id            serial
name          varchar
data_limit    bigint (bytes)
duration_days integer
price         integer (تومان)
is_active     boolean (default: true)
created_at    timestamp
```

### Account
```
id              serial
user_id         FK → User
plan_id         FK → Plan (nullable for test accounts)
marzban_username varchar
type            enum('paid', 'test')
expires_at      timestamp
created_at      timestamp
```

### Payment
```
id              serial
user_id         FK → User
plan_id         FK → Plan
amount          integer
status          enum('pending', 'awaiting_approval', 'approved', 'rejected', 'cancelled')
receipt_file_id varchar (nullable, Telegram file_id)
reviewed_by     bigint (nullable, admin chat_id)
created_at      timestamp
updated_at      timestamp
```

### BotMessage
```
id              serial
key             varchar(100) (unique)
text            text
updated_at      timestamp
```

---

## Next Steps

1. Set up Prisma schema with the data models above
2. Create DB seed for default plans and bot messages
3. Implement bot message service (DB-backed with caching)
4. Build scene handlers (Start → Home → Buy → Payment → Manage → Test → Support)
5. Wire up Telegraf with scenes and FSM
6. Admin payment approval handler (inline buttons in admin chat)
7. Account provisioning service (Marzban integration)
8. Error middleware and logging

---

## Implementation Rules

- One scene = one file in `src/bot/scenes/`
- Every scene must match its `design/bot/scenes/*.md` spec
- All user-facing text comes from `bot_messages` table — no hardcoded strings
- Plans are always loaded from DB — never hardcoded
- Test account eligibility checked via `user.has_test` flag
