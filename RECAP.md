# RECAP — Step 9: per-update user middleware cache

## What changed
- New `src/bot/middlewares/attachUser.ts`:
  - In-process `Map`-backed cache of `User` rows keyed by `chat_id`.
  - **60 s positive TTL** for hits (rapid clicks reuse the row).
  - **30 s negative TTL** for misses (banned / pending spam doesn't hit the DB on every update).
  - Soft size cap (10 000 entries) with simple FIFO-ish eviction so the cache can't grow without bound under a `chat_id` flood.
  - Exported helpers: `resolveAttachedUser(db, chatId)` for code outside the middleware chain, `invalidateUserCache(chatId)` for callers that mutate the User row, `_resetUserCache()` for tests, and the `attachUser()` middleware factory itself.
- `src/bot/context.ts`: new `AttachedUser` interface (slim — id, chat_id, status, has_test, bank_card_id, plan_group_id, first_name, last_name, username) and `BotState` interface (`{ user?: AttachedUser | null }`). `BotContext.state` now typed against `BotState`.
- `src/bot/middlewares/index.ts`: re-exports `attachUser`, `resolveAttachedUser`, `invalidateUserCache`.
- `src/bot/bot.ts`: registers `attachUser()` right after `errorHandler()` and before `channelCheck()`.
- `src/bot/middlewares/channelCheck.ts`: drops its own `db.user.findUnique`; reads `ctx.state.user` instead.
- `src/bot/handlers/adminUserApproval.ts`: calls `invalidateUserCache(user.chat_id)` after approving or banning so the user's very next interaction sees the new status.
- New tests `src/bot/middlewares/__tests__/attachUser.test.ts` — 7 tests: first call fetches and caches; second call hits cache; null result is cached with the 30 s TTL; positive TTL elapses correctly; negative TTL elapses correctly; separate chat ids have independent entries; `invalidateUserCache` drops a single entry; `select` shape is slim.

## Why
Almost every per-update path in the bot eventually needs the `User` row for the sender (channel check, scene entry, permission gating). Without a cache, each handler did its own `findUnique`. A single user rapid-clicking five buttons could rack up five identical DB roundtrips. With this middleware, each update does at most one `findUnique`; subsequent updates within 60 s reuse the cached row.

Negative caching matters too: a banned user spam-clicking would otherwise hit the DB every time only to have channelCheck silent-block them. 30 s of negative cache absorbs that abuse.

## Decisions
- **TTLs from `WORKING.md` exactly: 60 s positive / 30 s negative.** Short enough that admin actions take effect quickly, long enough that the cache is meaningful under typical rapid-click cadence.
- **Soft cap with FIFO eviction.** Simple and bounded. We don't need LRU here — a malicious flood from one `chat_id` only writes one entry; thousands of distinct ids get throttled to ~10K entries.
- **Slim `select`.** The cached row is everything most callers need (status / first_name / plan_group_id / bank_card_id) without large columns. Specialised callers can still do their own targeted query.
- **Mutation invalidation is opt-in.** Approve / ban paths invalidate; lower-priority mutations (test-account flag, profile edits) tolerate up to 60 s of staleness. Adding the call elsewhere is a one-liner if a follow-up surfaces a UX issue.
- **State typing on `BotContext`.** `ctx.state.user` is now type-checked everywhere; missing the middleware would be caught at compile time.

## Verification
- `yarn test` — 112/112 pass (7 new).
- `npx eslint src/bot/handlers src/bot/middlewares src/bot/context.ts src/bot/bot.ts` — clean (one pre-existing `no-explicit-any` warning in `bot.ts`).

## What's next
Step 10 in `WORKING.md`: observability — `pino` for structured logs with `requestId` per update, `prom-client` for a `/metrics` endpoint with histograms for Prisma and Marzban call durations.
