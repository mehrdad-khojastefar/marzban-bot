# Buy Account Scene

## Purpose
Display available plans from DB and initiate the purchase flow.

## Flow
1. Fetch active plans from DB
2. Display plan list as inline buttons
3. User selects a plan → create a Payment record (status: `pending`)
4. Show payment instructions with amount
5. Transition → `PAYMENT_PENDING`

## UI — Plan Selection
```
{buy.select_plan}

[ 🔹 {plan.name} - {plan.data_limit} - {plan.duration} روزه - {plan.price} تومان ]
[ 🔹 {plan.name} - {plan.data_limit} - {plan.duration} روزه - {plan.price} تومان ]
[ 🔹 ... ]
[ 🔙 بازگشت ]
```

## UI — Payment Instructions
```
{buy.payment_instructions}

مبلغ: {plan.price} تومان
شماره کارت: {config.card_number}

پس از واریز، رسید خود را ارسال کنید.

[ ❌ انصراف ]
```

## Messages
| Key | Default (Persian) |
|---|---|
| `buy.select_plan` | پلن مورد نظر خود را انتخاب کنید: |
| `buy.payment_instructions` | لطفاً مبلغ زیر را واریز کنید و رسید را ارسال کنید. |
| `buy.no_plans` | در حال حاضر پلنی موجود نیست. |

## Backend
- `db.plan.findActive()` — fetch available plans
- `db.payment.create({ userId, planId, amount, status: 'pending' })` — create payment record

## Transitions
```
BUY_ACCOUNT → PAYMENT_PENDING (after plan selection)
BUY_ACCOUNT → HOME (back button)
```
