# Doves Telegram Bot — Claude Code Context

## Project Boundary (Security)
You operate ONLY inside this project directory. Never read, write, or
execute anything outside it. Never access ~/.ssh, ~/.env, /etc, or any
path above the project root.

---

## Tech Stack
- **Language:** TypeScript / Node.js 24
- **Package Manager:** Yarn
- **Bot Library:** Telegraf.js
- **Database:** PostgreSQL + Prisma
- **HTTP Client:** Axios
- **Linting:** ESLint + Prettier (via Husky pre-commit)
- **Testing:** Vitest (unit)
- **VCS:** Git + GitHub CLI (`gh`)

---

## Current Scope
**Telegram Bot only.** CLI and Admin Panel are deferred — see TODO.md.
Never create files under `src/panel/` or `src/cli/` unless WORKING.md
explicitly says otherwise.

---

## Operation Modes

### Interactive Mode (you are talking to a human)
- Propose changes to CLAUDE.md, wait for approval before touching it.
- Ask for clarification before starting a new feature.
- Confirm destructive operations.

### Autonomous Mode (you are running headless via `claude -p`)
- Your task comes from WORKING.md. Read it first, always.
- Do not pause to ask questions. Make the best decision and document it
  in ARCHITECTURE.md.
- If tests fail: attempt to fix, retry up to 3 times, then abort with a
  clear error message in the commit body.
- When done: create a PR using `gh pr create` (see Workflow below).
- Never modify CLAUDE.md autonomously.

---

## Bot Rules
- **Language:** Persian (فارسی) for all user-facing text.
- **No hardcoded strings:** All copy comes from the `bot_messages` DB table.
- **Plans:** DB-based only — never hardcoded values.
- **Test accounts:** Gated by `test_enabled` BotSetting (`"true"` / `"false"`).
  1 hour / 100MB / one per user, enforced via `user.has_test` flag.
- **Single-message UI:** NEVER send a new message to the user.
  Always edit the existing one with `ctx.editMessageText()` or
  `ctx.editMessageReplyMarkup()`.
  Exception: config/subscription links sent separately for copying.
- **Scenes:** Every scene must match its spec in `design/bot/scenes/*.md`.
  Read the spec before writing any handler.

---

## User Access Control

### User Status (`users.status` enum)
| Status | Meaning |
|---|---|
| `pending` | User clicked deep link, awaiting admin approval. Bot sends NOTHING. |
| `approved` | Admin approved. User has full access to the bot. |
| `banned` | Admin rejected or manually banned. Bot sends NOTHING — ever. |

### Registration & Approval Flow
1. User opens `t.me/bot?start=<code>` → User record created with `status = pending`
2. Bot sends NOTHING to the user (no ⏳, no message, no keyboard)
3. Admin receives a notification with user details + ✅ تأیید / ❌ رد buttons
4. **Reject** → `status = banned`, user is permanently silent-blocked
5. **Approve** → admin selects bank cards (multiple) for the user → `status = approved`
6. User receives "your request has been approved" message
7. User can now use the bot

### Banned Users
- `status = banned` means the bot will NEVER send any message to this user.
- All handlers must check status before responding.
- Banned users who send `/start` get no response — complete silence.
- Admin can ban an approved user later (reversible via admin panel).

### Channel Membership
- Users must be a member of the configured channel (`CHANNEL_ID` env var)
  to use the bot.
- Checked on every interaction after approval.
- If not a member → show "join channel first" message with channel link.

---

## Admin as Seller

The admin (`ADMIN_CHAT_ID`) is a special user who is both admin AND seller:
- Admin has a Seller record (created automatically on first bot start)
- Accounts created via `admin.create_account` scene get the admin's `seller_id`
- Admin does NOT see the seller panel — they use their own admin panel
- Admin's seller record is used purely for account ownership tracking

---

## Seller Account Creation
- The final success message after seller creates an account shows:
  subscription link, config links, plan name, expiry date.
- **Price must NOT BE shown** in the seller's success message.

---

## Admin Account Creation Flow
1. Show all seller plans (deduplicated: same price + data_limit + type = one entry)
2. Above the plan list: option to create a one-time custom plan (GB + price, NOT saved to DB)
3. Admin picks plan or enters custom values → creates Marzban account
4. Account gets `seller_id` = admin's seller ID

---

## Reference Files (load as needed)
| File | Purpose |
|---|---|
| `WORKING.md` | **Source of truth for current task** |
| `ARCHITECTURE.md` | Technical decisions — update when you make a new one |
| `DESIGN.md` | UI/UX patterns and component structure |
| `RECAP.md` | Commit recap (write this before committing) |
| `TODO.md` | Deferred features — read-only reference |
| `docs/internal/marzban_api.json` | Marzban VPN API spec |
| `design/bot/scenes/*.md` | Per-scene specs |
| `design/bot/messages.md` | Bot message registry |

---

## Development Workflow

### Implementation Order (per feature)
1. **Read** `WORKING.md` — understand the full task before writing code.
2. **Read** the relevant scene spec in `design/bot/scenes/`.
3. **Implement** in this order: `src/core/` → `src/bot/`
4. **Write tests** in `src/__tests__/` mirroring the source path.
5. **Run** `yarn test` — fix all failures before proceeding.
6. **Run** `yarn lint` — fix all lint errors.
7. **Update** `ARCHITECTURE.md` with any new decisions.
8. **Update** `RECAP.md` with a summary of what changed and why.
9. **Commit** using the format below.
10. **Create PR** (autonomous mode only).

### Commit Format
feat(bot): <short description>

What changed
Why it changed
Any decisions made (if not obvious)


Only one scope per commit: `core` or `bot`. Never `cli` or `panel`.

### PR Creation (autonomous mode)
```bash
git add -A
git commit -m "feat(bot): <description>"
git push origin HEAD
gh pr create \
  --title "feat(bot): <description>" \
  --body "$(cat RECAP.md)" \
  --label "autonomous"
```

---

## Project Structure
src/
├── bot/          # Telegraf scenes, handlers, middleware
├── core/         # Business logic, Marzban client, DB access
├── db/           # Prisma schema, migrations, seeds
├── premzy/       # Premzy payment gateway callback server
├── sub/          # Subscription proxy server
├── panel/        # [DEFERRED] Next.js admin panel
├── cli/          # [DEFERRED] Commander.js CLI
└── tests/    # Vitest tests (mirrors src/ structure)

---

## Code Conventions
- **Naming:** `camelCase` variables, `PascalCase` classes/components
- **Exports:** Named exports preferred over default
- **Async:** `async/await` only — no `.then()` chains
- **Imports:** Absolute paths via `@/` alias
- **Error handling:**
  - All async functions wrapped in `try/catch`
  - Errors logged with context: `logger.error({ err, context }, 'message')`
  - User-facing errors return a message key from `bot_messages`, never
    raw error text
  - Never swallow errors silently

---

## Environment Variables
Never hardcode these. Read from `process.env`. See `.env.example`.

```bash
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=...
MARZBAN_API_URL=...
MARZBAN_USERNAME=...
MARZBAN_PASSWORD=...
ADMIN_CHAT_ID=...
CHANNEL_ID=...               # Telegram channel ID for membership check
SUPPORT_USERNAME=...
SUB_BASE_URL=...
MARZBAN_SUB_URL=...
SUB_PORT=8085
CONFIG_LINK_PREFIX=...
PREMZY_VENDOR_ID=...         # Optional — for Premzy payment flow
PREMZY_VENDOR_TOKEN=...
PREMZY_EC_PRIVATE_KEY_PATH=...
PREMZY_CALLBACK_PORT=8086
```

---

## Feature Flags (BotSettings)
| Key | Values | Default | Purpose |
|---|---|---|---|
| `buy_enabled` | `"true"` / `"false"` | `"false"` | Gates the buy button |
| `payment_method` | `"manual"` / `"premzy"` | `"manual"` | Which payment flow to use |
| `test_enabled` | `"true"` / `"false"` | `"false"` | Gates test account creation |

---

## Testing
- **Framework:** Vitest
- **Required:** `yarn test` must pass before any commit
- **Coverage:** Every new function in `src/core/` needs a unit test
- **Mocking:** Mock Prisma and Axios — never hit real DB or API in tests
- **E2E:** Not yet configured. Skip E2E for now.

---

## What "Done" Means
A feature is done when:
- [ ] All scene specs are implemented
- [ ] `yarn lint` passes with zero errors
- [ ] `yarn test` passes with zero failures
- [ ] `ARCHITECTURE.md` is updated with any new decisions
- [ ] `RECAP.md` is written
- [ ] Commit is made with correct format
- [ ] PR is created (autonomous mode) or flagged for review (interactive)
