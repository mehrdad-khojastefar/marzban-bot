# RECAP — Step 6: select discipline on the hot paths

## What changed
- `src/bot/middlewares/channelCheck.ts`: `db.user.findUnique` now selects only `status` instead of hydrating the whole `User` row on every update.
- `src/bot/services/messageService.ts`: `db.botMessage.findMany` now selects `{ key, text }` only — skips `id` and `updated_at`.
- `src/bot/services/settingService.ts`: `db.botSetting.findMany` now selects `{ key, value }` only — skips `updated_at`.
- `src/sub/server.ts`: the per-request account lookup now uses `select` with a nested `seller.select.link_prefix` instead of `include: { seller: true }`. Down from a full Account + full Seller payload to three fields total.

## Why
These four sites run on **every** update / message / subscription request — they're the hottest reads in the whole app. Selecting columns explicitly cuts serialisation cost, network bytes, and downstream object hydration with no behaviour change. It also makes adding new columns to those tables safe (a new `BankCard.is_admin_only` column won't accidentally pile into the channel-check payload).

## Decisions
- **Scope kept tight.** This PR only touches the four highest-traffic per-update / per-request sites. Other call sites (admin scenes, seller scenes) are slower paths and can adopt `select` incrementally — the `Performance Standards` section in `CLAUDE.md` makes the rule explicit for new code.
- **No new abstractions.** I considered a `selectUserStatus`-style helper, but a literal `select: { ... }` per call site is more readable, lets each caller pick exactly what it needs, and shows up cleanly in code review.
- **Sub-server query is still `findFirst`.** `marzban_sub_token` isn't `@unique` at the schema level (potential legacy duplicates) so `findFirst` is the safe call. Step 1's index makes it cheap regardless.

## Verification
- `yarn test` — 105/105 pass. Existing mocks accept additional args, so adding `select` doesn't break them.
- `npx eslint src/bot/services src/bot/middlewares src/sub` — clean (one pre-existing `no-explicit-any` warning unrelated to this PR).
- Behaviour preserved by inspection — fields referenced downstream are all in the new `select` shape.

## What's next
Step 7 in `WORKING.md`: wrap buy/renew flows in `db.$transaction`, separate Marzban side-effects from DB tx, and add idempotency guards for terminal-state transactions.
