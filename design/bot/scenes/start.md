# Start Scene

## Purpose
Entry point triggered by `/start`. Self-registers new users via deep link code. Detects sellers and redirects to Home.

## Flow
1. User sends `/start` or `/start <code>`
2. Parse deep link payload (the part after `/start `)
3. Check if user exists in DB (by `chat_id`)
4. **If user exists** → update first_name/last_name/username → seller check → HOME
5. **If user NOT found:**
   a. If no code provided → show error "لینک نامعتبر", stop
   b. Look up PlanGroup by `code` where `is_active = true`
   c. If no matching group → show error "لینک نامعتبر", stop
   d. Pick random active BankCard (nullable if none exist)
   e. Create User with `plan_group_id`, `bank_card_id`
   f. Seller check → HOME

## Deep Link
Telegram delivers `/start <code>` when user opens `t.me/doveng_bot?start=<code>`.
Code format: 8 hex chars (first segment of UUIDv4), e.g. `f47ac10b`.

## UI
- **Invalid/missing code (new user):** Error message, no menu, no buttons.
- **Valid registration:** Welcome message, then immediately show Home scene.
- **Returning user:** Welcome-back message, then Home scene.

## Messages
| Key | Default (Persian) |
|---|---|
| `start.welcome_new` | سلام {first_name}! به ربات VPN خوش آمدید. |
| `start.welcome_back` | سلام {first_name}! خوش برگشتید. |
| `start.invalid_link` | ❌ لینک نامعتبر است. لطفاً از لینک صحیح استفاده کنید. |
| `seller.welcome` | شما به عنوان فروشنده ثبت شده‌اید! از منوی اصلی به پنل فروشنده دسترسی دارید. |

## Backend
- `db.user.findUnique({ where: { chat_id } })` — check existence
- `db.planGroup.findUnique({ where: { code, is_active: true } })` — validate deep link
- `db.bankCard.findMany({ where: { is_active: true } })` — pick random card
- `db.user.create({ chat_id, first_name, last_name, username, plan_group_id, bank_card_id })` — register
- `db.user.update(id, { first_name, last_name, username })` — refresh profile (returning user)
- `db.seller.findUnique({ where: { chat_id } })` — check if seller
- `db.seller.update(id, { user_id })` — link seller to user

## Transitions
```
START → error message (new user, no/invalid code — dead end)
START → HOME (new user, valid code — registered)
START → HOME (existing user)
```

## Edge Cases
- User sends `/start` again while already registered → show `welcome_back`, go to HOME (code ignored)
- Telegram user without username → store as null
- Seller already linked (`user_id` set) → no re-linking, just show HOME with seller button
- Seller added by admin but hasn't started → on first `/start` with valid code, register + link + show `seller.welcome`
- No active bank cards at registration → create user with `bank_card_id = null`
- Deep link code for inactive group → same as invalid code
