# Buy Account Scene

## Purpose
Display available plans based on user's PlanGroup type and initiate the purchase flow. Two modes: per-GB (user picks GB count) or fixed (user picks from pre-defined plans).

## Flow — Per-GB Group
1. Fetch user's PlanGroup (type = `per_gb`)
2. Show GB picker with price info
3. User selects GB count
4. Fetch user's assigned bank card
5. If no card → show error, back to HOME
6. Show payment instructions with amount, card number (dashed), holder name
7. Create Payment record (status: `pending`, `plan_id = null`, `data_limit = bytes`, `bank_card_id`)
8. Transition → `PAYMENT_PENDING`

## Flow — Fixed Group
1. Fetch active plans from user's PlanGroup
2. Display plan list as inline buttons
3. User selects a plan
4. Fetch user's assigned bank card
5. If no card → show error, back to HOME
6. Show payment instructions with amount, card number (dashed), holder name
7. Create Payment record (status: `pending`, `plan_id`, `bank_card_id`)
8. Transition → `PAYMENT_PENDING`

## UI — GB Picker (per_gb)
```
{buy.select_gb}

هر گیگابایت {price_per_gb} تومان

[ 1 گیگ ] [ 2 گیگ ] [ 3 گیگ ]
[ 5 گیگ ] [ 10 گیگ ] [ 20 گیگ ]
[ 50 گیگ ] [ 100 گیگ ]
[ 🔙 بازگشت ]
```

## UI — Plan Selection (fixed)
```
{buy.select_plan}

[ 🔹 {plan.name} - {plan.data_limit} - {plan.duration} روزه - {plan.price} تومان ]
[ 🔹 {plan.name} - {plan.data_limit} - {plan.duration} روزه - {plan.price} تومان ]
[ 🔙 بازگشت ]
```

## UI — Payment Instructions (both flows)
```
{buy.payment_instructions}

مبلغ: {amount} تومان
شماره کارت:
`{card_number_dashed}`
به نام: {holder_name}

پس از واریز، رسید خود را ارسال کنید.

[ ❌ انصراف ]
```

## UI — No Card Error
```
{buy.no_card}

[ 🔙 بازگشت ]
```

## Messages
| Key | Default (Persian) |
|---|---|
| `buy.select_gb` | حجم مورد نظر خود را انتخاب کنید: |
| `buy.select_plan` | پلن مورد نظر خود را انتخاب کنید: |
| `buy.payment_instructions` | لطفاً مبلغ زیر را واریز کنید و رسید را ارسال کنید. |
| `buy.no_plans` | در حال حاضر پلنی موجود نیست. |
| `buy.no_card` | ❌ کارت بانکی برای شما تنظیم نشده. لطفاً با پشتیبانی تماس بگیرید. |

## Backend
- `db.user.findUnique({ where: { id }, include: { plan_group: { include: { plans: true } }, bank_card: true } })` — get user with group + card
- `db.payment.create({ userId, planId?, amount, dataLimit?, bankCardId, status: 'pending' })` — create payment record

## Card Display
- Card number stored without dashes: `6037997212345678`
- Displayed with dashes: `6037-9972-1234-5678`
- Wrapped in backticks for easy copy: `` `6037-9972-1234-5678` ``
- Holder name shown below card number

## Transitions
```
BUY_ACCOUNT → PAYMENT_PENDING (after selection, card found)
BUY_ACCOUNT → HOME (back button or no card assigned)
```
