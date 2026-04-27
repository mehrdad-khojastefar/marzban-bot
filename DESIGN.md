# Design

## Scene Map

```
/start <code>
  ├── No code + not registered → "لینک نامعتبر" error (dead end)
  ├── Invalid code             → "لینک نامعتبر" error (dead end)
  ├── New user + valid code    → register (random card, plan group) → HOME
  └── Existing user            → update profile → HOME
        ├── مدیریت اکانت‌ها           → MANAGE_ACCOUNTS → VIEW_ACCOUNT
        ├── اکانت تستی                → TEST_ACCOUNT
        ├── خرید اکانت                → BUY_ACCOUNT → PAYMENT_PENDING
        │     ├── per_gb group → pick GB → payment
        │     └── fixed group  → pick plan → payment
        ├── پشتیبانی                  → SUPPORT
        │
        ── seller-only ──
        ├── 🏪 پنل فروشنده            → SELLER_PANEL
        │     ├── ساخت اکانت          → SELLER_CREATE_ACCOUNT
        │     ├── اکانت‌ها             → SELLER_ACCOUNTS → SELLER_VIEW_ACCOUNT
        │     └── گزارش مالی           → SELLER_REPORT
        │
        ── admin-only ──
        ├── ⚙️ مدیریت فروشندگان       → ADMIN_SELLERS → ADMIN_SELLER_DETAIL
        │     ├── پلن‌ها               → ADMIN_SELLER_PLANS
        │     └── تسویه               → ADMIN_SELLER_ACCOUNTS
        ├── 💳 مدیریت کارت‌ها          → ADMIN_BANK_CARDS
        ├── 👤 مدیریت کاربران         → ADMIN_USERS
        ├── 📦 مدیریت پلن‌گروپ‌ها       → ADMIN_PLAN_GROUPS
        └── 📋 مدیریت اکانت‌ها         → ADMIN_ACCOUNTS → ADMIN_VIEW_ACCOUNT
```

## Modified Scenes

### START
- Parse deep link parameter: `/start <code>`
- **New user + valid code:** create User with `plan_group_id` + random `bank_card_id` → HOME
- **New user + no/invalid code:** show error message, stop
- **Existing user:** update first_name/last_name/username → HOME (ignore code)
- Seller check still applies (link seller on first start)

### HOME
- "خرید اکانت" gated by `buy_enabled` setting (toast if disabled)
- "🏪 پنل فروشنده" only for active sellers
- Admin buttons only for `ADMIN_CHAT_ID`:
  - "⚙️ مدیریت فروشندگان"
  - "💳 مدیریت کارت‌ها"
  - "👤 مدیریت کاربران"
  - "📦 مدیریت پلن‌گروپ‌ها" (new)

### BUY_ACCOUNT
- Fetches user's PlanGroup to determine flow type
- **Per-GB flow:** show GB picker → calculate price → payment
- **Fixed flow:** show plan list → payment (existing behavior)
- Fetches user's assigned bank card for payment instructions
- If no card assigned → show error, block purchase
- Payment record stores `bank_card_id` for financial tracking

## New/Updated Scenes

| Scene | Purpose |
|---|---|
| ADMIN_BANK_CARDS | Bank card CRUD: list, add, toggle active, delete |
| ADMIN_USERS | User management: list users, view details, reassign card |
| ADMIN_PLAN_GROUPS | Plan group management: list, create (auto-generates code), edit plans |

## Self-Registration Flow

```
User taps deep link: t.me/doveng_bot?start=f47ac10b
  → Bot parses code from /start payload
  → Look up PlanGroup where code = "f47ac10b" AND is_active = true
  → If not found → send error message, stop
  → If user already exists by chat_id → update profile → HOME
  → Pick random active BankCard
  → Create User:
      chat_id, first_name, last_name, username,
      plan_group_id, bank_card_id (nullable if no cards)
  → Seller check → HOME
```

## Buy Flow — Per-GB Group

```
User taps "خرید اکانت"
  → Check buy_enabled → if false, toast
  → Fetch user.plan_group (type = per_gb)
  → Show GB picker:
      "هر گیگابایت {price_per_gb} تومان
       حجم مورد نظر را انتخاب کنید:"
      [ 1 گیگ ] [ 2 گیگ ] [ 3 گیگ ]
      [ 5 گیگ ] [ 10 گیگ ] [ 20 گیگ ]
      [ 50 گیگ ] [ 100 گیگ ]
      [ 🔙 بازگشت ]
  → User picks GB
  → Fetch user.bank_card → if null, show error
  → Show payment instructions:
      مبلغ: {gb × price_per_gb} تومان
      شماره کارت:
      `6037-XXXX-XXXX-XXXX`
      به نام: {holder_name}
      پس از واریز، رسید خود را ارسال کنید.
  → Create Payment (status: pending, amount, data_limit, bank_card_id, plan_id = null)
  → PAYMENT_PENDING
```

## Buy Flow — Fixed Group

```
User taps "خرید اکانت"
  → Check buy_enabled → if false, toast
  → Fetch user.plan_group (type = fixed) + plans
  → Show plan list:
      "پلن مورد نظر خود را انتخاب کنید:"
      [ 🔹 5 گیگ - 30 روزه - 600 تومان ]
      [ 🔹 10 گیگ - 30 روزه - 1,100 تومان ]
      [ 🔙 بازگشت ]
  → User picks plan
  → Fetch user.bank_card → if null, show error
  → Show payment instructions (same format as per_gb)
  → Create Payment (status: pending, plan_id, amount, bank_card_id)
  → PAYMENT_PENDING
```

## Seller Account Creation Flow

```
Pick plan → Marzban addUser (s_XXXXXX, 30d, plan data_limit)
  → Save Account (payment_status: unpaid)
  → Prompt note (optional)
  → Send subscription link + config links
```

## Admin Settlement Flow

```
Filter (all/unpaid/paid) → checkbox select → batch mark as paid
Or: "تسویه همه" → mark ALL unpaid as paid
```

## Session Data

```typescript
// user info
userId?: number

// payment flow
selectedPlanId?: number
selectedGb?: number          // for per_gb flow
pendingPaymentId?: number

// seller flows
sellerId?: number
selectedSellerPlanId?: number
awaitingQuantity?: boolean
awaitingAccountName?: boolean
pendingDataLimit?: number
pendingPrice?: number
pendingPlanName?: string

// admin seller management
managingSellerId?: number
sellerEditField?: 'note' | 'link_prefix'
managingSellerPlanId?: number
accountFilter?: 'all' | 'unpaid' | 'paid'
selectedAccountIds?: number[]
currentPage?: number
searchQuery?: string

// admin bank card management
adminCardStep?: 'number' | 'holder' | 'bank'
pendingCardNumber?: string
pendingCardHolder?: string

// admin plan group management
managingGroupId?: number
```

## Setting System

```typescript
import { getSetting } from '@/bot/services/settingService'
const buyEnabled = await getSetting('buy_enabled')  // "true" | "false"
```

- DB-backed (`bot_settings` table), 30s cache TTL
- `initSettingService(db)` at startup

## UI Rules
- **Single-message UI:** Only ONE message per scene. Always `editMessageText`, never send new.
- **Exceptions:** Config/subscription links sent as separate copyable messages.
- **Language:** Persian (فارسی)
- **Copyable text:** Wrap in ``` for code blocks (card numbers, links, etc.)
