# Admin Users Scene

## Purpose
Admin manages bot users — view all users with status, approve pending users, assign multiple bank cards, ban/unban users.

## Flow
1. Show paginated list of all users with status icons (⏳/✅/🚫) and card count
2. Tap a user to see detail view with status-specific actions
3. Admin can add a new user (chat ID → multi-card selection → approved)

## UI — User List
```
👤 مدیریت کاربران

[ ➕ افزودن کاربر ]
[ ⏳ {first_name} - 💳 {card_count} ]
[ ✅ {first_name} - 💳 {card_count} ]
[ 🚫 {first_name} ]
[ ... ]

[ ⬅️ قبلی ] [ 1/3 ] [ بعدی ➡️ ]
[ 🔙 بازگشت ]
```

## UI — User Detail (pending)
```
👤 {first_name} (@{username})
🆔 چت آیدی: {chat_id}
وضعیت: ⏳ pending
💳 بدون کارت

[ ✅ تأیید   |   ❌ رد ]
[ 🔙 بازگشت ]
```

## UI — User Detail (approved)
```
👤 {first_name} (@{username})
🆔 چت آیدی: {chat_id}
وضعیت: ✅ approved
💳 {holder_name} - ****{last4}
💳 {holder_name} - ****{last4}

[ 💳 تغییر کارت‌ها ]
[ 🚫 بن کردن ]
[ 🔙 بازگشت ]
```

## UI — User Detail (banned)
```
👤 {first_name} (@{username})
🆔 چت آیدی: {chat_id}
وضعیت: 🚫 banned
💳 بدون کارت

[ ✅ رفع بن ]
[ 🔙 بازگشت ]
```

## UI — Multi-Card Selection (approve / edit cards / unban)
```
💳 کارت‌های بانکی را برای {first_name} انتخاب کنید:

انتخاب شده: {count} کارت

[ ✅ {holder_name} - ****{last4} ]   ← selected (toggled)
[ 💳 {holder_name} - ****{last4} ]   ← unselected
[ ... ]

[ ✅ تأیید انتخاب ]
[ 🔙 انصراف ]
```

## UI — Add User (multi-step)
```
Step 1: چت آیدی کاربر را وارد کنید:
        [ 🔙 بازگشت ]

Step 2: (Multi-card selection UI above)

Done:   ✅ کاربر {first_name} تأیید شد.
        💳 {count} کارت اختصاص داده شد.
        [ 🔙 بازگشت ]
```

## Actions by Status

| User Status | Available Actions |
|---|---|
| `pending` | Approve (→ card selection → approved + notify), Reject (→ banned) |
| `approved` | Edit cards (→ card selection), Ban (→ banned) |
| `banned` | Unban (→ card selection → approved + notify) |

## Card Assignment
- Users can have **multiple** bank cards (many-to-many `UserBankCards` relation)
- Toggle-based multi-select: tap card to select/deselect
- At least one card must be selected to confirm
- When editing cards for approved user, existing cards are pre-selected
- When unbanning, existing cards (if any) are pre-selected

## Messages
| Key | Default (Persian) |
|---|---|
| `admin.users_title` | 👤 مدیریت کاربران |
| `admin.user_enter_chatid` | چت آیدی کاربر را وارد کنید: |
| `admin.user_select_card` | کارت بانکی را برای این کاربر انتخاب کنید: |
| `admin.user_added` | ✅ کاربر با موفقیت اضافه شد. |
| `admin.user_exists` | ❌ این کاربر قبلاً اضافه شده. |
| `admin.user_card_updated` | ✅ کارت کاربر تغییر کرد. |
| `admin.no_active_cards` | ❌ هیچ کارت فعالی وجود ندارد. ابتدا یک کارت اضافه کنید. |
| `admin.no_users` | هنوز کاربری اضافه نشده. |
| `user.approved` | درخواست شما تأیید شد. (sent to user on approval) |

## Backend
- `db.user.findMany({ include: { bank_cards } })` — list all users with cards
- `db.user.create({ chat_id, first_name, status: 'pending' })` — add user
- `db.user.update(id, { status, bank_cards: { set: [...] } })` — update status + cards
- `db.bankCard.findMany({ where: { is_active: true } })` — active cards for selection

## Validation
- Chat ID: numeric, non-empty
- At least one bank card must be selected
- Duplicate chat_id → show `admin.user_exists` error

## Transitions
```
ADMIN_USERS → HOME (back button)
```

## Notes
- When admin adds a user, they are created as `pending` then immediately enter card selection to approve
- Paginate if more than 8 users per page
- Pre-select existing cards when editing or unbanning
- User gets notified on approval (pending→approved or banned→approved)
