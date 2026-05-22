# Admin Bank Cards Scene

## Purpose
Admin manages bank cards used for payment. CRUD operations: list, add, toggle active, delete.

## Flow
1. Show list of all bank cards with stats
2. Admin can add a new card (multi-step)
3. Admin can tap a card to toggle active/inactive
4. Admin can delete a card (only if no users assigned)

## UI — Card List
```
💳 مدیریت کارت‌های بانکی

{card.holder_name}
`{card.card_number_dashed}`
{card.bank_name} — {assigned_count} کاربر
{active_badge}

{card.holder_name}
`{card.card_number_dashed}`
...

[ ➕ افزودن کارت ]
[ 🔙 بازگشت ]
```

Each card shown as a tappable button row:
```
[ 💳 {holder_name} - {last_4_digits} {status_icon} ]
```

## UI — Card Detail (on tap)
```
💳 جزئیات کارت

شماره: `{card_number_dashed}`
به نام: {holder_name}
بانک: {bank_name ?? '—'}
وضعیت: {active ? 'فعال ✅' : 'غیرفعال ❌'}
کاربران: {assigned_count} نفر

[ 🔄 تغییر وضعیت ]
[ 🗑 حذف ]          ← only if assigned_count = 0
[ 🔙 بازگشت ]
```

## UI — Add Card (multi-step)
```
Step 1: شماره کارت را وارد کنید:
        [ 🔙 انصراف ]

Step 2: نام صاحب کارت را وارد کنید:
        [ 🔙 انصراف ]

Step 3: نام بانک را وارد کنید (اختیاری):
        [ ⏭ رد شدن  |  🔙 انصراف ]

Done:   ✅ کارت با موفقیت اضافه شد.
        [ 🔙 بازگشت به لیست ]
```

## Messages
| Key | Default (Persian) |
|---|---|
| `admin.cards_title` | 💳 مدیریت کارت‌های بانکی |
| `admin.card_enter_number` | شماره کارت را وارد کنید (16 رقم): |
| `admin.card_enter_holder` | نام صاحب کارت را وارد کنید: |
| `admin.card_enter_bank` | نام بانک را وارد کنید (اختیاری): |
| `admin.card_added` | ✅ کارت با موفقیت اضافه شد. |
| `admin.card_deleted` | 🗑 کارت حذف شد. |
| `admin.card_has_users` | ❌ این کارت به کاربرانی اختصاص داده شده و قابل حذف نیست. |
| `admin.card_invalid_number` | شماره کارت نامعتبر است. لطفاً 16 رقم وارد کنید. |
| `admin.no_cards` | هنوز کارتی اضافه نشده. |

## Backend
- `db.bankCard.findMany()` — list all cards with user count
- `db.bankCard.create({ card_number, holder_name, bank_name })` — add card
- `db.bankCard.update(id, { is_active })` — toggle active
- `db.bankCard.delete(id)` — delete (check no users assigned)
- `db.user.count({ where: { bank_card_id } })` — count assigned users

## Validation
- Card number: exactly 16 digits (strip spaces/dashes on input)
- Holder name: non-empty string
- Bank name: optional, can skip

## Transitions
```
ADMIN_BANK_CARDS → HOME (back button)
```

## Notes
- Display card number with dashes: `6037-9972-1234-5678`
- Store without dashes in DB: `6037997212345678`
- Active/inactive badge: ✅ / ❌
- Cannot delete a card that has users assigned — show error
