# Commit Recap

## What changed
Added a new admin-only scene, `SCENE_ADMIN_MOVE_ACCOUNT`, that transfers ownership of an existing account from its current user to another approved user. Entered from the existing account detail view via a new `🔄 نقل اکانت به کاربر دیگر` button. The new owner is identified by sharing their Telegram contact via the native "share contact" keyboard; the validated move updates only `accounts.user_id` and emits an `admin.account_ownership_moved` event.

## Key decisions
- **Entry from account detail, not from a new top-level menu:** an account is selected first (using the existing admin flows), then a new owner is shared via contact — matches the request in `WORKING.md` and reuses existing list/detail UX.
- **DB-only update, no Marzban call:** Marzban does not track ownership; only `accounts.user_id` changes. `marzban_username`, expiry, plan, etc. are untouched.
- **`seller_id` preserved:** the Prisma update payload contains only `user_id`. Original seller attribution stays intact so commission/reporting is not disturbed.
- **Unknown contacts rejected:** if the shared contact's `user_id` doesn't map to a `User`, or the user is not `approved`, the move is refused with a Persian message; the admin can immediately share a different contact without restarting the scene.
- **Reply-keyboard exception:** Telegram's `request_contact` requires a reply keyboard, not an inline one. The scene sends a second short-lived message carrying the reply keyboard and dismisses it (delete + zero-width-space `remove_keyboard`) as soon as a valid contact arrives or the admin cancels. Documented in `ARCHITECTURE.md`.

## Files changed
```
src/core/moveAccount.ts                                # NEW: moveAccountOwnership() core fn
src/core/__tests__/moveAccount.test.ts                 # NEW: 6 unit tests (success + each error branch)
src/bot/scenes/adminMoveAccount.ts                     # NEW: scene with wait_contact + confirm states
src/bot/scenes/constants.ts                            # added SCENE_ADMIN_MOVE_ACCOUNT
src/bot/scenes/index.ts                                # registered adminMoveAccountScene
src/bot/scenes/adminViewAccount.ts                     # added entry button + action
src/bot/context.ts                                     # added moveAccount* session fields
src/core/events/types.ts                               # added AdminAccountOwnershipMovedPayload + map entry
src/core/events/eventFormat.ts                         # added formatter for admin.account_ownership_moved
src/db/seeds/seed.ts                                   # 10 new admin.move_account_* messages

design/bot/scenes/admin_move_account.md                # NEW: scene spec
design/bot/messages.md                                 # registry rows for the new keys
ARCHITECTURE.md                                        # "Move Account Ownership" decisions section
WORKING.md                                             # expanded source spec (already updated)
```

## Verification
- `yarn lint`: zero new errors or warnings introduced by this change (pre-existing lint debt elsewhere unchanged).
- `yarn test`: 150/150 pass — including 6 new tests covering the success path (with `seller_id` preserved and the event payload), `account_not_found`, `user_not_found`, `user_not_approved` for both `pending` and `banned`, and `same_owner`.
