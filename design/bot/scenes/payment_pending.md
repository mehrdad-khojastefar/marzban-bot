# Payment Pending Scene

## Purpose
Waiting state after user selects a plan. User sends payment receipt (photo/screenshot), admin manually approves or rejects.

## Flow
1. User sends receipt image → store as `receipt_file_id` on Payment record
2. Notify admin (forward receipt + payment details to admin chat/group)
3. Admin approves or rejects via inline buttons in admin notification
4. On approve → transition to `ACCOUNT_PROVISIONING`
5. On reject → notify user, transition to `HOME`

## UI — Waiting
```
{payment.waiting}

پلن: {plan.name}
مبلغ: {plan.price} تومان
وضعیت: ⏳ در انتظار تأیید

[ ❌ انصراف ]
```

## UI — Admin Notification
```
💳 درخواست پرداخت جدید

کاربر: {user.first_name} (@{user.username})
پلن: {plan.name}
مبلغ: {plan.price} تومان

[receipt image]

[ ✅ تأیید  |  ❌ رد ]
```

## Messages
| Key | Default (Persian) |
|---|---|
| `payment.waiting` | رسید شما دریافت شد. لطفاً منتظر تأیید بمانید. |
| `payment.send_receipt` | لطفاً رسید پرداخت خود را ارسال کنید. |
| `payment.approved` | ✅ پرداخت شما تأیید شد! اکانت در حال ساخت است... |
| `payment.rejected` | ❌ پرداخت شما تأیید نشد. لطفاً دوباره تلاش کنید. |
| `payment.cancelled` | انصراف از پرداخت. |

## Backend
- `db.payment.update(id, { receipt_file_id, status: 'awaiting_approval' })`
- `db.payment.approve(id)` → sets `status: 'approved'`
- `db.payment.reject(id)` → sets `status: 'rejected'`
- Admin notification via bot.telegram.sendPhoto to admin chat

## Transitions
```
PAYMENT_PENDING → ACCOUNT_PROVISIONING (admin approves)
PAYMENT_PENDING → HOME (admin rejects or user cancels)
PAYMENT_PENDING → ERROR (timeout / system failure)
```

## Edge Cases
- User sends text instead of image → prompt again with `payment.send_receipt`
- User cancels → update payment status to `cancelled`, go HOME
- Admin doesn't respond → no automatic timeout (stays pending until manual action)
