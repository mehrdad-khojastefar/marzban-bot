# Doves Telegram Bot

A multi-interface VPN subscription management system for Marzban panel.

## Tech Stack
- **Language:** TypeScript
- **Runtime:** Node.js 24
- **Package Manager:** Yarn
- **Framework:** Next.js (admin panel)
- **Database:** PostgreSQL + Prisma
- **HTTP Client:** Axios
- **Bot Library:** Telegraf.js
- **Pre-commit:** Prettier, ESLint, Husky
- **VCS:** Git

## Current Focus
Telegram bot only. CLI and admin panel are deferred to `TODO.md`.

## Architecture Overview
Three interfaces, one core (bot is the current priority):
- **Telegram Bot:** User-facing subscription management (Persian)
- **Admin Panel:** Next.js/React dashboard (deferred)
- **CLI:** Command-line admin tools (deferred)
- **Shared Core:** Business logic, DB models, Marzban API client

## Bot Rules
- **Language:** Persian (فارسی)
- **No hardcoded strings:** All user-facing text comes from `bot_messages` DB table
- **Payment:** Manual admin approval (no payment gateway)
- **Plans:** DB-based, never hardcoded
- **Test accounts:** 1 hour, 100MB, one per user (checked via `user.has_test` flag)
- **Scenes:** Every scene must match its `design/bot/scenes/*.md` spec
- **Single-message UI:** The user must see only ONE message throughout the entire conversation. Never send a new message — always edit the existing one using `ctx.editMessageText()` / `ctx.editMessageReplyMarkup()`. The only exceptions are config/subscription links (sent as separate messages the user needs to copy). This keeps the chat clean and prevents button spam.

## Available Files (load as needed)
- `@docs/internal/marzban_api.json` - Marzban VPN API spec
- `@WORKING.md` - Current task with detailed steps
- `@ARCHITECTURE.md` - Technical decisions and system design
- `@DESIGN.md` - UI/UX patterns, component structure
- `@RECAP.md` - Recap of the commit
- `@TODO.md` - Deferred features (CLI, admin panel, etc.)
- `@design/bot/scenes/*.md` - Scene design specs (one per scene)
- `@design/bot/messages.md` - Bot message registry and DB-backed message system

## Development Workflow
1. **Read task:** Check `@WORKING.md` for current feature
2. **Implementation order:** Core → Bot (CLI and panel deferred)
3. **Document decisions:** Update `@ARCHITECTURE.md` and `@DESIGN.md`
4. **Commit format:** `feat(core|bot): description` (cli|panel added later)
5. **Mark complete:** Update `@WORKING.md` status
6. **Ask before proceeding:** Don't start new features without instruction

## Code Conventions
- **Naming:** camelCase (variables), PascalCase (components/classes)
- **Exports:** Named exports preferred over default
- **Error handling:** [Try/catch strategy? Error codes?]
- **Async:** Prefer async/await over .then()
- **Imports:** Absolute paths using `@/` alias

## Project Structure
src/
├── bot/          # Telegraf bot (scenes, handlers)
├── panel/        # Next.js pages and components
├── cli/          # Commander.js commands
├── core/         # Shared logic (db, marzban client, utils)
└── db/           # Schemas, migrations, seeds

## Environment Variables
Required in `.env.example`:
```bash
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=...
MARZBAN_API_URL=...
MARZBAN_ADMIN_TOKEN=...
ADMIN_SECRET=...
```

## Testing
- **Unit:** Vitest
- **E2E:** [Strategy TBD]
- **Pre-commit:** `yarn test` (required to pass)

## Notes for Claude
- **Propose, don't modify:** Suggest CLAUDE.md changes, wait for approval
- **Stay in scope:** Only implement what's in WORKING.md
- **Document architecture:** Every technical decision goes in ARCHITECTURE.md
- **One feature = 3 commits:** CLI, then Bot, then Panel
