# Move account ownership to another user

## Goal

Add a feature that lets the admin transfer ownership of an existing Marzban account from one user to another. The admin selects the target account from the existing admin account detail view, identifies the new owner by sharing that person's Telegram contact via the native "share contact" button, confirms, and the account's `accounts.user_id` is updated.

Marzban itself does not model ownership — ownership lives only in our DB. So this is a DB-only state change plus an event-log entry. No Marzban API call is made.

## Product decisions (locked)

- **Entry point:** from the admin account detail view (`adminViewAccount`). A new button is added below the existing edit/delete controls.
- **Unknown contact:** if the shared contact's Telegram user is not yet a registered user in our `users` table, the move is rejected. Admin is told the user must `/start` the bot and be approved first. Admin can immediately share another contact without restarting the flow.
- **`seller_id` rule:** preserved — only `user_id` is updated. The original seller keeps their attribution.
- **Permission:** only the admin (`ADMIN_CHAT_ID`) can use this feature, enforced the same way as every other admin scene.

## UX flow

1. Admin is already inside `adminViewAccount` for some account (reached via the existing admin accounts list or seller accounts list).
2. Admin taps the new button `🔄 نقل اکانت به کاربر دیگر`.
3. Bot edits the same message (single-message rule) to a prompt naming the account + current owner, with an inline `🔙 انصراف` button.
4. Bot also sends a short follow-up message with a *reply* keyboard containing a single `request_contact` button (this is the documented exception to the single-message rule — Telegram only allows contact-sharing from a reply keyboard).
5. Admin shares a contact:
   - If `contact.user_id` is missing (privacy setting) → show error key, stay in step.
   - If no `User` row with `chat_id = contact.user_id` → show "user not registered" key, stay in step.
   - If `user.status !== 'approved'` → show "user not approved" key, stay in step.
   - If `user.id === account.user_id` → show "same owner" key, stay in step.
   - Otherwise → remove the reply keyboard, transition to `confirm`.
6. Confirmation message: account username, current owner (name + chat_id), new owner (name + chat_id), with `[✅ بله، نقل بده]` and `[🔙 انصراف]`.
7. Confirm → DB update + event log → success message → return to `adminViewAccount` (which re-renders with the new owner).
8. Cancel from any step → reply keyboard removed, session keys cleared, return to `adminViewAccount`.

## Implementation

### New files
- `src/bot/scenes/adminMoveAccount.ts` — scene handler. Pattern after `src/bot/scenes/adminBankCards.ts` (small admin scene with a clear step enum).
- `src/core/moveAccount.ts` — exported function `moveAccountOwnership({ accountId, newUserId, actor })`. Does validation + the Prisma update + `logEvent('admin.account_ownership_moved', ...)`. Kept in core per CLAUDE.md's `src/core/ → src/bot/` order rule.
- `src/__tests__/core/moveAccount.test.ts` — unit tests against mocked Prisma covering: success path, `seller_id` preserved, unknown user, same-user, banned/pending user.
- `design/bot/scenes/admin_move_account.md` — scene spec following the same structure as `design/bot/scenes/admin_bank_cards.md` and `design/bot/scenes/admin_group_modify.md`.

### Modifications
- `src/bot/scenes/constants.ts` — add `export const SCENE_ADMIN_MOVE_ACCOUNT = 'scene:admin_move_account';`.
- `src/bot/scenes/index.ts` — import `adminMoveAccountScene`, add to `createStage()`, re-export the constant.
- `src/bot/scenes/adminViewAccount.ts` — insert a new keyboard row at line ~149 (just before the back row):
  - `Markup.button.callback('🔄 نقل اکانت به کاربر دیگر', 'move_account')`
  - Add `adminViewAccountScene.action('move_account', ...)` that calls `ctx.scene.enter(SCENE_ADMIN_MOVE_ACCOUNT)` — the new scene reads `ctx.session.selectedAccountId` directly, same pattern as the existing edit actions.
- `src/bot/context.ts` — extend `SessionData` with:
  - `moveAccountStep?: 'wait_contact' | 'confirm';`
  - `moveAccountTargetUserId?: number;`
  - `moveAccountReplyMsgId?: number;` — id of the throwaway reply-keyboard message so it can be cleared on transition/cancel.
- `design/bot/messages.md` and the `bot_messages` seed — add the keys listed below.

### Core function shape

```ts
// src/core/moveAccount.ts
export type MoveAccountError =
  | 'account_not_found'
  | 'user_not_found'
  | 'user_not_approved'
  | 'same_owner';

export async function moveAccountOwnership(args: {
  accountId: number;
  newUserId: number;
  actor: Actor;
}): Promise<{ ok: true; account: Account } | { ok: false; error: MoveAccountError }>;
```

- Single `db.account.update({ where: { id }, data: { user_id: newUserId } })`. `seller_id` is intentionally absent from the `data` payload so it is preserved.
- All validation happens here too (account exists, target user exists + is approved, not same owner) so the scene can stay thin and the tests can cover edge cases without touching Telegram.
- On success calls `logEvent('admin.account_ownership_moved', { accountId, marzbanUsername, fromUserId, toUserId }, actor)` — mirrors `admin.account_deleted` event in `adminViewAccount.ts:515-524`.

### Reused utilities (do not reimplement)
- `sendOrEdit` — `src/bot/services/renderService.ts:12`.
- `logEvent`, `actorFrom` — `src/core/events.ts`.
- `getDb` — `src/core/db.ts`.
- Persian message lookup via `getMessage()` from `src/bot/services/messageService.ts`.
- `getBackScene(ctx)` helper from `adminViewAccount.ts:24-28` — copy the same pattern so cancel returns to the list the admin came from.

## New `bot_messages` keys

Seeded via the same mechanism as the existing keys (see `design/bot/messages.md`). Persian text, with `{placeholders}` interpolated at render time.

| Key | Text |
|---|---|
| `admin.move_account_prompt` | `🔄 نقل اکانت\n\nاکانت: \`{username}\`\nمالک فعلی: {currentOwner}\n\nلطفاً مخاطب کاربر جدید را با دکمه پایین به اشتراک بگذارید.` |
| `admin.move_account_send_contact` | `برای ادامه، مخاطب کاربر جدید را به اشتراک بگذارید.` |
| `admin.move_account_contact_no_user_id` | `اطلاعات این مخاطب ناقص است (شناسه تلگرام موجود نیست). لطفاً مخاطب دیگری ارسال کنید.` |
| `admin.move_account_user_not_registered` | `این کاربر هنوز در ربات ثبت‌نام نکرده است. ابتدا باید /start را اجرا کند و توسط ادمین تأیید شود.` |
| `admin.move_account_user_not_approved` | `این کاربر هنوز توسط ادمین تأیید نشده است.` |
| `admin.move_account_same_owner` | `این اکانت در حال حاضر متعلق به همین کاربر است.` |
| `admin.move_account_confirm` | `⚠️ تأیید نقل اکانت\n\nاکانت: \`{username}\`\nاز: {fromName} ({fromChatId})\nبه: {toName} ({toChatId})\n\nادامه دهیم؟` |
| `admin.move_account_done` | `✅ اکانت با موفقیت به {toName} منتقل شد.` |
| `admin.move_account_failed` | `❌ خطا در نقل اکانت. لطفاً دوباره تلاش کنید.` |
| `admin.move_account_share_contact_button` | `📱 اشتراک‌گذاری مخاطب کاربر جدید` |

## Edge cases to handle

- **Contact with no `user_id`:** Telegram returns `contact.user_id = undefined` when the contact has hidden their Telegram account from contact-sharing. Treat as the "missing id" branch above — do not silently fall back to phone-number lookup.
- **Account deleted between steps:** if `moveAccountOwnership` finds no account, return `account_not_found`, render the failure key, and bounce back to the accounts list (via `getBackScene`).
- **Admin shares their own contact:** falls through the same-owner branch if admin already owns the account; otherwise it's allowed (admin can become the owner — `seller_id` still preserved).
- **Reply keyboard left dangling on crash:** the cancel/confirm/success paths must always remove the reply keyboard (`Markup.removeKeyboard()` on a tiny "..." message, then delete it, OR `ctx.telegram.deleteMessage` on the stored `moveAccountReplyMsgId`). Test both transitions.
- **`ctx.session.selectedAccountId` missing on scene enter:** redirect to `getBackScene(ctx)` immediately, the same defensive check `adminViewAccount.ts:36-39` performs.

## Verification

1. `yarn lint` — zero errors.
2. `yarn test` — zero failures, including the new `src/__tests__/core/moveAccount.test.ts` covering each `MoveAccountError` branch and the success path.
3. Manual end-to-end against a local DB + test bot:
   - As `ADMIN_CHAT_ID`, open any account's detail view → confirm the new button appears.
   - Tap it → expect the prompt message + reply-keyboard button at the bottom.
   - Share a contact for an approved `User` → confirmation step → confirm → success.
   - Re-open the same account: new owner shown. `select user_id, seller_id from accounts where id = ?` in psql confirms `user_id` changed and `seller_id` is unchanged.
   - Share a contact for an unregistered Telegram user → rejection message; reply keyboard still active; admin can immediately share another contact.
   - Share a contact for a `pending` or `banned` user → rejection message.
   - Share own contact when admin already owns the account → "same owner" message.
   - Cancel from `wait_contact` and from `confirm` → returns to detail view with no stray reply keyboard.
4. Confirm the events forum supergroup receives an `admin.account_ownership_moved` event with the expected `{ accountId, marzbanUsername, fromUserId, toUserId }` payload.

## Definition of done

- [ ] All files in "New files" exist and follow project conventions (TypeScript, named exports, absolute imports via `@/`).
- [ ] All modifications listed above are applied.
- [ ] `yarn lint` and `yarn test` are green.
- [ ] `design/bot/scenes/admin_move_account.md` matches the implemented behaviour.
- [ ] `ARCHITECTURE.md` notes the deliberate reply-keyboard exception to the single-message rule (if not already covered there).
- [ ] `RECAP.md` summarizes the change.
- [ ] Commit follows `feat(bot): …` format with `bot` scope.
# Speed & Scalability — SQL, Database, and Code-Layer Improvements

## Goal

Make the bot blazingly fast and capable of serving **10,000 concurrent users / accounts** on a single small VPS without infrastructure overhaul.

## Success Criteria (SLOs)

| Metric | Target |
|---|---|
| p50 update → reply latency (cached path) | < 80 ms |
| p95 update → reply latency | < 300 ms |
| p99 update → reply latency | < 800 ms |
| Marzban call p95 (cached token) | < 250 ms |
| Subscription endpoint p95 | < 50 ms |
| Sustained throughput | 200 updates/sec |
| Memory (bot process) | < 512 MB steady-state |
| Zero N+1 in any per-update code path | enforced by code review |

## Non-Goals

- No multi-region / sharding.
- No Redis dependency unless a P1 fix demands it (we'll attempt to stay in-process + Postgres).
- No rewrite. Surgical, reversible diffs only.
- No new features. UX behavior stays identical.

## Out of Scope (already on TODO.md)

- Admin panel.
- CLI.
- E2E tests.

---

## Findings Summary (from codebase audit)

See `DESIGN.md → Performance & Scalability Design` for the full design rationale and target architecture. Highlights:

### P0 — breaks at 10K
1. **Missing Postgres indexes** on `Account.user_id`, `Account.seller_id`, `Account.marzban_username`, `Account.marzban_sub_token`, `Account.expires_at`, `User.status`, `Payment.user_id`, `Payment.status`, `Seller.user_id`, `Transaction.user_id`, `Transaction.account_id`. (`prisma/schema.prisma`)
2. **No connection-pool sizing** on PrismaPg adapter (`src/core/db/client.ts`). Default 10 connections is a hard ceiling.
3. **N+1 in `adminViewAccount.ts`** — 9 `db.account.findUnique` calls across one session. Cache in `ctx.session`.
4. **`findMany` without aggregation** in `sellerReport.ts` — loads all rows to sum in JS. Use `db.account.aggregate`.
5. **No transaction boundaries** around renew / buy flows (`renewAccount.ts`, `buyAccount.ts`) → inconsistent state on partial failure.
6. **No Marzban username index** → subscription server full-scans on every request (`src/sub/server.ts`).

### P1 — bad latency under load
7. **Marzban Axios client** has no HTTP keep-alive agent → new TCP per call.
8. **Sequential awaits** in buy/renew scene handlers that should be `Promise.all`.
9. **`BotSetting` / `BotMessage` re-read per update** — wrap in proper LRU + pub-sub-style invalidation on writes (currently TTL only, stale up to 5 min).
10. **`select` discipline** missing across hot reads — fetching all columns when 2 fields suffice.
11. **Marzban token cache** has no proactive TTL refresh; relies on 401 → retry path.

### P2 — polish / observability
12. No slow-query logging, no request IDs, no Prisma query events.
13. No metrics endpoint (cannot detect what breaks first).
14. `BigInt` vs `Int` consistency on `chat_id` is fine (BigInt) but `data_limit` should stay BigInt (already is).
15. Background reminders / expiry scans (if any) are not paginated.

---

## Work Plan

Each step is independently shippable. Don't bundle. One PR per group.

### Step 1 — Schema indexes (P0, low-risk, biggest win)
- Add indexes in `prisma/schema.prisma`:
  - `Account`: `@@index([user_id])`, `@@index([seller_id])`, `@@index([marzban_username])`, `@@index([marzban_sub_token])`, `@@index([expires_at])`, `@@index([seller_id, payment_status])`
  - `User`: `@@index([status])`
  - `Payment`: `@@index([user_id])`, `@@index([status])`, `@@index([user_id, status])`
  - `Transaction`: `@@index([user_id])`, `@@index([account_id])`, `@@index([user_id, status])`
  - `Seller`: keep `chat_id` unique (already present); no new index needed.
- Generate migration; verify on a copy of prod data with `EXPLAIN ANALYZE`.
- **Deliverable:** one migration file + RECAP.md note. No code change.

### Step 2 — Prisma connection pool + slow-query logging (P0)
- In `src/core/db/client.ts`: pass `?connection_limit=25&pool_timeout=10` (or equivalent adapter setting) via `DATABASE_URL`, or pass through PrismaPg config.
- Enable Prisma `log: [{ level: 'query', emit: 'event' }]` and log queries > 100 ms with the params redacted.
- Document the new env-var format in `.env.example`.

### Step 3 — Marzban client hardening (P1)
- Add `http.Agent({ keepAlive: true, maxSockets: 50 })` + `https.Agent` to the axios instance.
- Add proactive token refresh: track `tokenIssuedAt`, refresh at 80% of TTL (assume 30 min if unknown).
- Add a small retry policy: 1 retry on network error / 5xx, no retry on 4xx.
- Add per-call timeout (`timeout: 8000`).
- **No** queue / circuit-breaker yet — measure first.

### Step 4 — Kill N+1 in `adminViewAccount.ts` (P0)
- After first `findUnique`, store account in `ctx.session.viewedAccount`.
- On any mutation, refresh once and re-cache.
- Add a unit test that counts Prisma calls via a mock and asserts ≤ 2 per scene action.

### Step 5 — Aggregate in `sellerReport.ts` (P0)
- Replace `findMany` + JS reduce with `db.account.aggregate({ where, _sum: { price: true }, _count: true })`.
- Same for the unpaid-stats path in `adminAccounts.ts` — fold into a single query with `groupBy`.

### Step 6 — `select` discipline on hot paths (P1)
- Audit every `findUnique` / `findMany` in `src/bot/scenes/**` and `src/bot/middleware/**`.
- Add explicit `select` for: user lookup by chat_id, plan lookup, bot_messages, bot_settings, sub-token lookup.
- Codify a rule in `CLAUDE.md` (interactive-mode change request, not autonomous).

### Step 7 — Transactional buy/renew (P0 for correctness)
- Wrap "create Transaction + decrement quota + reserve username" in `db.$transaction(...)`.
- On Marzban call failure, mark transaction `failed` in a follow-up tx — never leave `provisioning` orphaned.
- Add an idempotency check: same `transaction_id` reaching the executor twice is a no-op.

### Step 8 — In-process cache for `BotSetting` + `BotMessage` (P1)
- Replace TTL-only cache with a `Map` + version counter.
- On any admin write to `bot_settings` / `bot_messages`, bump the version → next read repopulates.
- For multi-process safety later: switch to Postgres `LISTEN/NOTIFY` (deferred, not in scope unless we go multi-process).

### Step 9 — Per-update user middleware cache (P1)
- A single `findUnique` per update for `User` by `chat_id`, attached to `ctx.state.user`.
- All downstream handlers read `ctx.state.user` instead of re-querying.
- Add a 30-second negative cache for `pending` / `banned` users so they don't hit the DB on every spam click.

### Step 10 — Observability baseline (P2 but ship before scaling test)
- Structured logger (pino) with `requestId` per update.
- `/metrics` endpoint (prom-client) exposing: updates/sec, prisma query duration histogram, marzban call duration, scene transition counts.
- Wire a `process.on('unhandledRejection')` that logs and continues.

### Step 11 — Load test (validation)
- Script a synthetic 10K-user replay (start, view, buy, renew, view).
- Run against a staging DB seeded with 10K users + 10K accounts.
- Confirm SLOs from the top of this doc. If any miss, open follow-up issue, don't extend this branch.

---

## Decision Log

Decisions taken while doing this work go in `ARCHITECTURE.md` (not here). Each PR's `RECAP.md` summarizes what changed and why.

## Definition of Done

- [ ] Steps 1–9 merged.
- [ ] `EXPLAIN ANALYZE` evidence for the 5 hottest queries attached to the PR for Step 1.
- [ ] Load-test report (Step 11) attached to the final PR.
- [ ] `yarn test` + `yarn lint` clean.
- [ ] `ARCHITECTURE.md` updated with any new architectural decisions.
- [ ] No new dependencies beyond `pino` and `prom-client` (and only if Step 10 lands).
