# Commit Recap

## What was built
A full Persian Telegram VPN bot with Marzban integration — DB layer, message system, all 9 scenes, admin payment approval, and account provisioning.

## Key choices
- **Prisma 7** with PostgreSQL — 5 models (User, Plan, Account, Payment, BotMessage)
- **DB-backed messages** — all Persian text in `bot_messages` table, 5min in-memory cache
- **Telegraf scenes** — 9 scenes following FSM pattern, all reading from design specs
- **Manual payment** — user sends receipt photo, admin approves/rejects via inline buttons
- **Test accounts** — 1 hour, 100MB, one per user, checked via `has_test` flag
- **Zod env validation** — fail fast on startup if any required var is missing
- **103 tests** across 14 files, all passing

## Files
```
prisma/
├── schema.prisma         # 5 models + 2 enums
└── prisma.config.ts      # Prisma 7 config

src/core/
├── marzban/              # Marzban API client (44 methods, 76 tests)
├── db/                   # Prisma singleton (initDb/getDb)
└── utils/                # Config (Zod), formatting (Persian digits, bytes, price)

src/bot/
├── bot.ts                # createBot() wiring
├── main.ts               # Entry point
├── context.ts            # BotContext + SessionData
├── scenes/               # 9 scenes (start, home, buy, payment, manage, view, test, support, error)
├── handlers/             # Admin payment approve/reject
├── middlewares/           # Error handler
└── services/             # Message service (DB + cache)

src/db/seeds/seed.ts      # Default plans + 22 bot messages
```

## Dig deeper
- Architecture & decisions → `ARCHITECTURE.md`
- Scene reference & API design → `DESIGN.md`
- Scene specs → `design/bot/scenes/*.md`
- Message registry → `design/bot/messages.md`
- Marzban service guide → `docs/src/core/marzban/marzban_service.md`
