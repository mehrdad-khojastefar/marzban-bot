# Commit Recap

## What changed
Switched the admin move-account scene from `request_contact` (which only shares the admin's *own* phone) to `request_users` — a native Telegram user picker — so the admin can pick *any* user as the new owner. The `contact` handler is kept as a graceful fallback for admins who reach for the attachment-menu contact-share path instead of the new picker button. Reply-keyboard exception remains, but the keyboard now carries a `userRequest` button (`user_is_bot: false`, `max_quantity: 1`).

## Key decisions
- **`request_users` over `request_contact`:** `request_contact` was a UX dead-end — Telegram clients interpret it as "share *your* number", not "pick another user". `request_users` opens a proper user picker, which is exactly what the admin needs to nominate a new owner.
- **Keep `contact` handler as a fallback:** removing it would silently fail for admins who tap "share contact" from the attachment menu out of habit. Both inbound shapes feed the same `handleTargetUserId` lookup pipeline.
- **`request_id = 1`:** an arbitrary 32-bit constant — there is only one picker per scene so collisions are impossible.

## Files changed
```
src/bot/scenes/adminMoveAccount.ts          # userRequest keyboard + users_shared handler + shared lookup fn
src/db/seeds/seed.ts                        # updated 4 admin.move_account_* default messages
design/bot/scenes/admin_move_account.md     # updated scene spec (picker + contact fallback)
design/bot/messages.md                      # updated message registry rows
```

## Verification
- `yarn lint`: zero new errors or warnings introduced by this change (pre-existing lint debt elsewhere unchanged).
- `yarn test`: existing 6 `moveAccount` core tests still pass — the change is purely at the scene-handler layer, core `moveAccountOwnership()` logic is untouched.
- Type check: `users_shared` + `Markup.button.userRequest` are supported by telegraf 4.16.3 / @telegraf/types.
