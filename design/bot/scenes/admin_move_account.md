# Admin Move Account Ownership Scene

## Purpose
Admin transfers ownership of an existing account from its current user to another approved user. Triggered from the account detail view. Updates `accounts.user_id` only — `seller_id` is preserved so original sales attribution stays intact. Marzban itself does not model account ownership, so this is a DB-only state change plus an event-log entry.

## Entry
- Scene ID: `scene:admin_move_account`
- Entered only from `scene:admin_view_account` via the new `🔄 نقل اکانت به کاربر دیگر` button.
- Requires `ctx.session.selectedAccountId` to be set (set by the parent scene). If missing or the account no longer exists, the scene bounces back to `scene:admin_view_account`.
- Admin gate: `ctx.from.id === ADMIN_CHAT_ID`.

## Step Machine
Stored in `ctx.session.moveAccountStep`.

| Step | What happens |
|---|---|
| `wait_contact` | Inline prompt + a separate message carrying a reply keyboard with a `request_contact` button. Admin shares a contact. |
| `confirm` | Inline confirmation message with `[✅ بله، نقل بده]` and `[🔙 انصراف]`. |

## UI — Step `wait_contact`

The existing inline message (the account detail) is edited to:
```
🔄 نقل اکانت به کاربر دیگر

اکانت: `{username}`
مالک فعلی: {currentOwner}

لطفاً مخاطب کاربر جدید را با دکمه‌ی پایین صفحه به اشتراک بگذارید.

[ 🔙 انصراف ]
```

In addition, a second message is sent with a Telegram **reply** keyboard:
```
برای ادامه، مخاطب کاربر جدید را به اشتراک بگذارید.

⌨️ Reply keyboard:
[ 📱 اشتراک‌گذاری مخاطب کاربر جدید ]   ← request_contact
```

This is the documented exception to the single-message UI rule. The reply-keyboard message is dismissed as soon as a valid contact arrives or the admin cancels (see Notes below).

### Validation on contact receive
1. `ctx.message.contact.user_id` must be present. If missing (privacy), show `admin.move_account_contact_no_user_id` and stay in step.
2. `User` row must exist with `chat_id = contact.user_id`. Otherwise show `admin.move_account_user_not_registered`.
3. `user.status === 'approved'`. Otherwise show `admin.move_account_user_not_approved`.
4. `user.id !== account.user_id`. Otherwise show `admin.move_account_same_owner`.

In all rejection branches the reply keyboard remains active so the admin can immediately share a different contact.

If the admin sends any text instead of a contact, the bot re-prompts via `admin.move_account_send_contact`.

## UI — Step `confirm`
```
⚠️ تأیید نقل اکانت

اکانت: `{username}`
از: {fromName} ({fromChatId})
به: {toName} ({toChatId})

ادامه دهیم؟

[ ✅ بله، نقل بده | 🔙 انصراف ]
```

On `✅ بله، نقل بده` → `moveAccountOwnership()` is called. On success the message is replaced with `admin.move_account_done` and a back button that returns to the account detail view.

## Messages
| Key | Default (Persian) | Variables |
|---|---|---|
| `admin.move_account_prompt` | (see registry) | username, currentOwner |
| `admin.move_account_send_contact` | برای ادامه، مخاطب کاربر جدید را به اشتراک بگذارید. | — |
| `admin.move_account_share_contact_button` | 📱 اشتراک‌گذاری مخاطب کاربر جدید | — |
| `admin.move_account_contact_no_user_id` | ❌ اطلاعات این مخاطب ناقص است... | — |
| `admin.move_account_user_not_registered` | ❌ این کاربر هنوز در ربات ثبت‌نام نکرده است... | — |
| `admin.move_account_user_not_approved` | ❌ این کاربر هنوز توسط ادمین تأیید نشده است. | — |
| `admin.move_account_same_owner` | ⚠️ این اکانت در حال حاضر متعلق به همین کاربر است. | — |
| `admin.move_account_confirm` | (see registry) | username, fromName, fromChatId, toName, toChatId |
| `admin.move_account_done` | ✅ اکانت با موفقیت به {toName} منتقل شد. | toName |
| `admin.move_account_failed` | ❌ خطا در نقل اکانت. لطفاً دوباره تلاش کنید. | — |

## Backend
- Single core function `moveAccountOwnership({ db, accountId, newUserId, actor })` in `src/core/moveAccount.ts`.
- Updates only `account.user_id`. `seller_id` is intentionally not included in the `data` payload of `db.account.update` so Prisma leaves it untouched.
- No Marzban API call — Marzban does not store ownership.
- Emits a single `admin.account_ownership_moved` event with `{ accountId, marzbanUsername, fromUserId, fromChatId, toUserId, toChatId }`.

## Session namespace
| Key | Purpose |
|---|---|
| `moveAccountStep` | `'wait_contact' \| 'confirm'` |
| `moveAccountTargetUserId` | resolved local `users.id` of the new owner |
| `moveAccountReplyMsgId` | message id of the throwaway reply-keyboard prompt, so it can be deleted on transition/cancel |

`selectedAccountId` is read from session — set by the parent `scene:admin_view_account`.

## Transitions
```
ADMIN_VIEW_ACCOUNT → ADMIN_MOVE_ACCOUNT (button)
ADMIN_MOVE_ACCOUNT → ADMIN_VIEW_ACCOUNT (cancel, success, or invalid state)
```

## Notes
- **Reply-keyboard exception:** Telegram's `request_contact` only works on a reply keyboard, not on inline buttons. The scene therefore briefly breaks the project's single-message rule by sending a second message that carries the reply keyboard. As soon as the move is confirmed or cancelled, that message is deleted and a zero-width-space message with `remove_keyboard: true` is sent and immediately deleted to ensure the keyboard is dismissed across all Telegram clients.
- **`seller_id` preserved:** The admin's "move" only changes who *owns* the account, not who *sold* it. This keeps seller reports/commission attribution intact.
- **Unknown contacts are rejected:** If the shared contact is not yet a registered `User` (status anything) the move is refused. The new owner must `/start` the bot and be approved before they can receive a moved account. This is consistent with the existing approval flow described in `CLAUDE.md`.
- **No Marzban call:** The `marzban_username` stays the same; the new owner sees this account when they open their accounts list (filtered by `user_id`).
