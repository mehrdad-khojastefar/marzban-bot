# Doves Telegram Bot

A multi-interface VPN subscription management system for Marzban panel.

## Tech Stack
- **Language:** TypeScript
- **Runtime:** Node.js [version?]
- **Package Manager:** Yarn
- **Framework:** Next.js (admin panel)
- **Database:** PostgreSQL + [Prisma/TypeORM?]
- **Bot Library:** Telegraf.js
- **Pre-commit:** Prettier, ESLint, Husky
- **VCS:** Git

## Architecture Overview
Three interfaces, one core:
- **Telegram Bot:** User-facing subscription management
- **Admin Panel:** Next.js/React dashboard
- **CLI:** Command-line admin tools
- **Shared Core:** Business logic, DB models, Marzban API client

## Available Files (load as needed)
- `@docs/internal/marzban_api.json` - Marzban VPN API spec
- `@docs/internal/telegram_bot.md` - Bot commands, flows, UI patterns
- `@docs/internal/admin_panel.md` - Admin UI requirements
- `@docs/internal/cli.md` - CLI command reference
- `@WORKING.md` - Current task with detailed steps
- `@ARCHITECTURE.md` - Technical decisions and system design
- `@DESIGN.md` - UI/UX patterns, component structure

## Development Workflow
1. **Read task:** Check `@WORKING.md` for current feature
2. **Implementation order:** CLI → Bot → Admin Panel (separate commits)
3. **Document decisions:** Update `@ARCHITECTURE.md` and `@DESIGN.md`
4. **Commit format:** `feat(cli|bot|panel): description`
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
