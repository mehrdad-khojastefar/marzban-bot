# Design

## New Scenes

| Scene | Purpose |
|---|---|
| RENEW_ACCOUNT | Plan selection for renewing an existing account |

### Existing Scenes (for reference)

| Scene | Purpose |
|---|---|
| ADMIN_BANK_CARDS | Bank card CRUD: list, add, toggle active, delete |
| ADMIN_USERS | User management: list users, view details, reassign card |
| ADMIN_PLAN_GROUPS | Plan group management: list, create (auto-generates code), edit plans |


## Renew Flow — Per-GB Group

```
User in VIEW_ACCOUNT taps "🔄 تمدید اکانت"
  → Check renew_enabled → if false, toast
  → Set session.renewAccountId = account.id
  → Enter RENEW_ACCOUNT scene
  → Fetch user.plan_group (type = per_gb)
  → Show current account summary:
      📛 نام: {account_name}
      📊 مصرف: {used} / {limit}
      ⏰ انقضا: {days_left}
  → Show GB picker (same options as buy):
      "حجم تمدید را انتخاب کنید:
       هر گیگابایت {price_per_gb} تومان"
      [ 1 گیگ ] [ 2 گیگ ] [ 3 گیگ ]
      [ 5 گیگ ] [ 10 گیگ ] [ 20 گیگ ]
      [ 50 گیگ ] [ 100 گیگ ]
      [ 🔙 بازگشت ]
  → User picks GB
  → Pick random active card from user's cards → if null, show error
  → Show payment instructions (same as buy)
  → Create Transaction (type: renew, account_id, status: awaiting_receipt, amount, data_limit, bank_card_id)
  → PAYMENT_PENDING
```

## Renew Flow — Fixed Group

```
User in VIEW_ACCOUNT taps "🔄 تمدید اکانت"
  → Check renew_enabled → if false, toast
  → Set session.renewAccountId = account.id
  → Enter RENEW_ACCOUNT scene
  → Fetch user.plan_group (type = fixed) + plans
  → Show current account summary (same as per_gb)
  → Show plan list:
      "پلن تمدید را انتخاب کنید:"
      [ 🔹 5 گیگ - 30 روزه - 600 تومان ]
      [ 🔹 10 گیگ - 30 روزه - 1,100 تومان ]
      [ 🔙 بازگشت ]
  → User picks plan
  → Pick random active card → if null, show error
  → Show payment instructions
  → Create Transaction (type: renew, account_id, plan_id, amount, bank_card_id)
  → PAYMENT_PENDING
```

## Renew Approval & Execution

```
Admin approves transaction (or Premzy callback fires)
  → Check transaction.type
  → If "buy": provisionAccount() (existing behavior — create new Marzban user)
  → If "renew": renewAccount()
      1. Fetch account from transaction.account_id
      2. marzban.getUser(account.marzban_username)
         → current_data_limit, current_expire
      3. Calculate:
         new_data_limit = current_data_limit + transaction.data_limit
         base_expire = max(current_expire, now_timestamp)
         new_expire = base_expire + (transaction.duration_days × 86400)
      4. marzban.modifyUser(username, {
           data_limit: new_data_limit,
           expire: new_expire,
           status: 'active'      ← reactivates if expired/limited
         })
      5. Update Account in DB:
         expires_at = new Date(new_expire × 1000)
      6. Mark Transaction as completed
      7. Notify user:
         ✅ اکانت شما تمدید شد!
         📛 نام: {name}
         📦 حجم جدید: {new_data_limit}
         ⏰ انقضای جدید: {new_expire_date}
```

