# Seller System MVP

## Goal

Add a seller management system to the Telegram bot. Sellers are trusted resellers added by admin who can instantly create VPN accounts and settle payments later. End-user purchase flow is disabled for now.

---

## Data Model

### New Model: `Seller`

| Field        | Type             | Notes                                              |
| ------------ | ---------------- | -------------------------------------------------- |
| `id`         | Int, PK          | Auto-increment                                     |
| `chat_id`    | BigInt, unique   | Telegram chat ID (set by admin on creation)        |
| `user_id`    | Int?, FK → User  | Filled when seller `/start`s the bot               |
| `note`       | String?          | Admin's private note about this seller             |
| `is_active`  | Boolean          | Default `true`, admin can deactivate               |
| `created_at` | DateTime         | Default `now()`                                    |

- **Relations:** `plans[]` (SellerPlan), `accounts[]` (Account)
- A Seller record can exist before the person has ever opened the bot (`user_id = null`).
- When the seller `/start`s, we match by `chat_id`, link the `user_id`, and fill `username`/`first_name`/`last_name` from Telegram.

### New Model: `SellerPlan`

| Field         | Type            | Notes                                  |
| ------------- | --------------- | -------------------------------------- |
| `id`          | Int, PK         | Auto-increment                         |
| `seller_id`   | Int, FK→Seller  | Which seller owns this plan            |
| `name`        | String          | Display name, e.g. "5 گیگ"            |
| `data_limit`  | BigInt          | In bytes                               |
| `price`       | Int             | Toman — what the seller pays us        |
| `is_active`   | Boolean         | Default `true`                         |
| `created_at`  | DateTime        | Default `now()`                        |

- **Duration is fixed at 30 days** for all accounts (not per-plan). When we need per-plan duration later, add `duration_days` here.
- Admin creates/edits/deactivates plans per seller.

### New Enum: `AccountPaymentStatus`

```
unpaid | paid
```

### Modified Model: `Account`

Add these fields:

| Field             | Type                       | Notes                                    |
| ----------------- | -------------------------- | ---------------------------------------- |
| `seller_id`       | Int?, FK → Seller          | Null for non-seller accounts (test, etc) |
| `payment_status`  | AccountPaymentStatus?      | Null for non-seller accounts             |
| `seller_plan_id`  | Int?, FK → SellerPlan      | Which plan was used to create it         |
| `note`            | String?                    | Seller's note (searchable)               |

### New Model: `BotSetting`

| Field        | Type              | Notes                                         |
| ------------ | ----------------- | --------------------------------------------- |
| `key`        | String, PK        | Setting identifier, e.g. `"buy_enabled"`      |
| `value`      | String            | Setting value, e.g. `"false"`                 |
| `updated_at` | DateTime          | Auto-update on change                         |

- Runtime feature toggles — no restart needed.
- Initial settings seeded:
  - `buy_enabled` = `"false"` (buy flow disabled by default for now)
- Cached in-memory with short TTL (same pattern as `MessageService`), so changes take effect within seconds.
- Admin can toggle from the bot (future: add a settings scene). For now, toggled directly in DB or via a simple admin command.

### Existing models: no other changes

`User`, `Plan`, `Payment`, `BotMessage` stay as-is. The `Payment` model is unused for now but preserved.

---

## Bot Scenes

### Modified: HOME

```
┌──────────────────────────────────┐
│  سلام {first_name}!             │
│  از منوی زیر انتخاب کنید:       │
│                                  │
│  [🛒 خرید اکانت]    → toast     │
│  [🎁 تست رایگان]    → TEST      │
│  [📋 اکانت‌های من]   → MANAGE    │
│  [📞 پشتیبانی]      → SUPPORT   │
│                                  │
│  ── seller-only ──               │
│  [🏪 پنل فروشنده]   → SELLER    │
│                                  │
│  ── admin-only ──                │
│  [⚙️ مدیریت فروشندگان] → ADMIN  │
└──────────────────────────────────┘
```

- "خرید اکانت" checks `BotSetting` key `buy_enabled`. If `"false"` → shows inline toast: `"این بخش فعلاً در دسترس نیست!"` — no scene transition. If `"true"` → enters BUY_ACCOUNT scene as before.
- "پنل فروشنده" only visible if `user.chat_id` matches an active `Seller`.
- "مدیریت فروشندگان" only visible if `user.chat_id === ADMIN_CHAT_ID`.

### Modified: START

On `/start`, after user creation/lookup:
- Check if a `Seller` record exists with this `chat_id` but no `user_id` yet.
- If yes: link `user_id`, fill Telegram info, and show a welcome message: `"شما به عنوان فروشنده ثبت شده‌اید! از منوی اصلی به پنل فروشنده دسترسی دارید."`

---

### New Scene: `SELLER_PANEL`

Entry: "پنل فروشنده" button in HOME (seller-only).

```
┌──────────────────────────────────┐
│  🏪 پنل فروشنده                 │
│                                  │
│  [➕ ساخت اکانت]                │
│  [📋 اکانت‌های من]               │
│  [📊 گزارش مالی]                │
│  [🔙 بازگشت]                    │
└──────────────────────────────────┘
```

### New Scene: `SELLER_CREATE_ACCOUNT`

Entry: "ساخت اکانت" from SELLER_PANEL.

**Flow:**
1. Show seller's active plans as buttons:
   ```
   ┌──────────────────────────────────┐
   │  پلن مورد نظر را انتخاب کنید:  │
   │                                  │
   │  [5 گیگ - 450,000 تومان]        │
   │  [1 گیگ - 200,000 تومان]        │
   │  [🔙 بازگشت]                    │
   └──────────────────────────────────┘
   ```
2. On plan selection → create Marzban account instantly:
   - **Username format:** `s_` + 6 random alphanumeric chars (e.g. `s_a8f3k2`)
   - **Data limit:** from `SellerPlan.data_limit`
   - **Duration:** 30 days (fixed)
   - **Status:** active
3. Save `Account` record: `seller_id`, `seller_plan_id`, `payment_status = unpaid`
4. Prompt for note:
   ```
   ┌──────────────────────────────────────────┐
   │  ✅ اکانت ساخته شد!                     │
   │                                          │
   │  نام: s_a8f3k2                           │
   │  پلن: 5 گیگ                              │
   │  انقضا: 1405/02/15                       │
   │                                          │
   │  یادداشت بنویسید (یا رد شوید):          │
   │  [⏭ رد کردن]                             │
   └──────────────────────────────────────────┘
   ```
5. Save note (or skip) → send subscription link/config → return to SELLER_PANEL.

### New Scene: `SELLER_ACCOUNTS`

Entry: "اکانت‌های من" from SELLER_PANEL.

```
┌──────────────────────────────────────┐
│  📋 اکانت‌های شما (۲۳ اکانت)       │
│                                      │
│  [🔍 جستجو]                         │
│                                      │
│  s_a8f3k2 - علی ۵ گیگ    ⬜ unpaid  │
│  s_k9m2x1 - رضا ۱ گیگ    ✅ paid    │
│  s_p3q7w5 - (بدون یادداشت) ⬜ unpaid │
│  ...                                 │
│                                      │
│  [◀ قبلی]  صفحه ۱ از ۳  [▶ بعدی]   │
│  [🔙 بازگشت]                        │
└──────────────────────────────────────┘
```

- **Pagination:** 8 accounts per page.
- **Search:** Tapping "جستجو" prompts for text, filters accounts by `note` field (partial match, case-insensitive).
- **Tap an account** → `SELLER_VIEW_ACCOUNT`

### New Scene: `SELLER_VIEW_ACCOUNT`

Entry: tap an account in SELLER_ACCOUNTS.

```
┌──────────────────────────────────────┐
│  📊 جزئیات اکانت                    │
│                                      │
│  نام: s_a8f3k2                       │
│  پلن: 5 گیگ                          │
│  وضعیت: فعال ✅                      │
│  مصرف: ۲.۳ از ۵ گیگ (۴۶٪)           │
│  ██████░░░░░░░░ ۴۶٪                  │
│  انقضا: ۱۴ روز مانده (1405/02/15)   │
│  پرداخت: پرداخت نشده ⬜              │
│  یادداشت: علی تهران                  │
│                                      │
│  [📎 ارسال لینک اشتراک]             │
│  [✏️ ویرایش یادداشت]                │
│  [🔙 بازگشت]                        │
└──────────────────────────────────────┘
```

- **Usage data** fetched live from Marzban API.
- **Progress bar** visual for data usage.
- **"ارسال لینک اشتراک"** sends the Marzban subscription link to the seller (they forward it to their customer).
- **"ویرایش یادداشت"** prompts for new note text.

### New Scene: `SELLER_REPORT`

Entry: "گزارش مالی" from SELLER_PANEL.

```
┌──────────────────────────────────────┐
│  📊 گزارش مالی                       │
│                                      │
│  کل اکانت‌ها: ۲۳                    │
│  فعال: ۱۸  |  منقضی: ۵              │
│                                      │
│  💰 مالی:                            │
│  جمع بدهی: ۱۰,۳۵۰,۰۰۰ تومان       │
│  پرداخت شده: ۷,۲۰۰,۰۰۰ تومان      │
│  مانده: ۳,۱۵۰,۰۰۰ تومان            │
│                                      │
│  [🔙 بازگشت]                        │
└──────────────────────────────────────┘
```

---

### New Scene: `ADMIN_SELLERS`

Entry: "مدیریت فروشندگان" button in HOME (admin-only).

```
┌──────────────────────────────────────┐
│  ⚙️ مدیریت فروشندگان                │
│                                      │
│  [➕ افزودن فروشنده]                 │
│                                      │
│  علی (@ali_shop) - ۳,۱۵۰,۰۰۰ T بدهی│
│  رضا (@reza_vpn) - ۰ T بدهی         │
│  ۱۲۳۴۵۶ (هنوز شروع نکرده)          │
│  ...                                 │
│                                      │
│  [🔙 بازگشت]                        │
└──────────────────────────────────────┘
```

- Shows all sellers: name + username (or chat_id if not started yet) + outstanding debt.
- "افزودن فروشنده" → prompts admin to enter a chat ID.
  - If chat ID already a seller → show error.
  - Otherwise → create `Seller` record. If the user has already `/start`-ed, link `user_id` immediately and notify them.
- **Tap a seller** → `ADMIN_SELLER_DETAIL`

### New Scene: `ADMIN_SELLER_DETAIL`

Entry: tap a seller in ADMIN_SELLERS.

```
┌──────────────────────────────────────┐
│  👤 جزئیات فروشنده                   │
│                                      │
│  نام: علی محمدی                      │
│  یوزرنیم: @ali_shop                  │
│  چت آیدی: 123456789                  │
│  یادداشت: نماینده تهران              │
│  وضعیت: فعال ✅                      │
│                                      │
│  📊 خلاصه مالی:                      │
│  اکانت‌ها: ۲۳ (۱۸ فعال)             │
│  بدهی: ۳,۱۵۰,۰۰۰ تومان             │
│                                      │
│  [📋 پلن‌ها]                         │
│  [📊 اکانت‌ها و تسویه]              │
│  [✏️ ویرایش یادداشت]                │
│  [🔴 غیرفعال کردن]                  │
│  [🔙 بازگشت]                        │
└──────────────────────────────────────┘
```

### New Scene: `ADMIN_SELLER_PLANS`

Entry: "پلن‌ها" from ADMIN_SELLER_DETAIL.

```
┌──────────────────────────────────────┐
│  📋 پلن‌های فروشنده: علی             │
│                                      │
│  [➕ افزودن پلن]                     │
│                                      │
│  1. 5 گیگ - 450,000 T  ✅           │
│  2. 1 گیگ - 200,000 T  ✅           │
│  3. 10 گیگ - 800,000 T  ❌ غیرفعال  │
│                                      │
│  [🔙 بازگشت]                        │
└──────────────────────────────────────┘
```

- **"افزودن پلن"** → sequential prompts: name → data limit (GB) → price (Toman).
- **Tap a plan** → toggle active/inactive or edit (name, data_limit, price).

### New Scene: `ADMIN_SELLER_ACCOUNTS`

Entry: "اکانت‌ها و تسویه" from ADMIN_SELLER_DETAIL.

```
┌──────────────────────────────────────────┐
│  📊 اکانت‌های فروشنده: علی              │
│                                          │
│  فیلتر: [همه] [⬜ پرداخت‌نشده] [✅ شده] │
│                                          │
│  ☑️ s_a8f3k2 - 5G - 450,000T  ⬜        │
│  ☑️ s_k9m2x1 - 1G - 200,000T  ⬜        │
│  ☐ s_p3q7w5 - 5G - 450,000T  ✅         │
│  ...                                     │
│                                          │
│  ۲ انتخاب شده - جمع: ۶۵۰,۰۰۰ تومان    │
│  [✅ تسویه انتخاب‌شده‌ها]                │
│  [✅ تسویه همه پرداخت‌نشده‌ها]           │
│                                          │
│  [◀ قبلی]  صفحه ۱ از ۳  [▶ بعدی]       │
│  [🔙 بازگشت]                            │
└──────────────────────────────────────────┘
```

- **Filter buttons** to toggle between all / unpaid / paid.
- **Checkboxes** for selecting individual accounts (toggle on tap).
- **"تسویه انتخاب‌شده‌ها"** → batch mark selected as `paid`.
- **"تسویه همه پرداخت‌نشده‌ها"** → batch mark ALL unpaid as `paid`.
- **Pagination:** 8 per page.

---

## Feature Toggles (DB-based)

The `BotSetting` table controls runtime feature flags — admin can enable/disable sections on the fly with no downtime.

| Key            | Default  | Effect                                                                                      |
| -------------- | -------- | ------------------------------------------------------------------------------------------- |
| `buy_enabled`  | `false`  | When `false`, "خرید اکانت" button shows toast. When `true`, enters BUY_ACCOUNT as normal.   |

- **Runtime:** Changes in DB take effect within the cache TTL (~30 seconds). No restart required.
- **PAYMENT_PENDING scene:** unreachable when buy is disabled (no entry point), code preserved.
- **Payment model:** untouched, unused while buy is disabled.
- **Extensible:** future toggles (e.g. `test_enabled`, `seller_enabled`) follow the same pattern.

---

## Bot Messages (new keys)

All new user-facing strings go into `bot_messages` DB table. Keys to add:

```
buy.disabled                    → "این بخش فعلاً در دسترس نیست!"

seller.welcome                  → "شما به عنوان فروشنده ثبت شده‌اید! ..."
seller.panel_title              → "🏪 پنل فروشنده"
seller.select_plan              → "پلن مورد نظر را انتخاب کنید:"
seller.no_plans                 → "هنوز پلنی برای شما تعریف نشده..."
seller.account_created          → "✅ اکانت ساخته شد!\n\nنام: {name}\n..."
seller.enter_note               → "یادداشت بنویسید (یا رد شوید):"
seller.note_saved               → "یادداشت ذخیره شد."
seller.accounts_title           → "📋 اکانت‌های شما ({count} اکانت)"
seller.no_accounts              → "هنوز اکانتی نساخته‌اید."
seller.search_prompt            → "متن جستجو را وارد کنید:"
seller.search_no_results        → "نتیجه‌ای یافت نشد."
seller.account_detail           → "📊 جزئیات اکانت\n\nنام: {name}\n..."
seller.enter_new_note           → "یادداشت جدید را وارد کنید:"
seller.report                   → "📊 گزارش مالی\n\n..."
seller.create_failed            → "خطا در ساخت اکانت. لطفاً دوباره تلاش کنید."

admin.sellers_title             → "⚙️ مدیریت فروشندگان"
admin.add_seller_prompt         → "چت آیدی فروشنده جدید را وارد کنید:"
admin.seller_added              → "✅ فروشنده اضافه شد."
admin.seller_exists             → "این کاربر قبلاً فروشنده است."
admin.invalid_chat_id           → "چت آیدی نامعتبر است."
admin.seller_detail             → "👤 جزئیات فروشنده\n\n..."
admin.seller_deactivated        → "فروشنده غیرفعال شد."
admin.seller_activated          → "فروشنده فعال شد."
admin.plan_name_prompt          → "نام پلن را وارد کنید:"
admin.plan_data_prompt          → "حجم را به گیگابایت وارد کنید:"
admin.plan_price_prompt         → "قیمت را به تومان وارد کنید:"
admin.plan_added                → "✅ پلن اضافه شد."
admin.accounts_settled          → "✅ {count} اکانت تسویه شد."
admin.enter_seller_note         → "یادداشت را وارد کنید:"
admin.note_saved                → "یادداشت ذخیره شد."
admin.no_sellers                → "هنوز فروشنده‌ای اضافه نشده."
admin.seller_notified           → "فروشنده از ثبت خود مطلع شد."
admin.seller_not_started        → "فروشنده هنوز ربات را استارت نکرده. پس از استارت مطلع می‌شود."
```

---

## Scene Constants

```typescript
SELLER_PANEL            = 'SELLER_PANEL'
SELLER_CREATE_ACCOUNT   = 'SELLER_CREATE_ACCOUNT'
SELLER_ACCOUNTS         = 'SELLER_ACCOUNTS'
SELLER_VIEW_ACCOUNT     = 'SELLER_VIEW_ACCOUNT'
SELLER_REPORT           = 'SELLER_REPORT'
ADMIN_SELLERS           = 'ADMIN_SELLERS'
ADMIN_SELLER_DETAIL     = 'ADMIN_SELLER_DETAIL'
ADMIN_SELLER_PLANS      = 'ADMIN_SELLER_PLANS'
ADMIN_SELLER_ACCOUNTS   = 'ADMIN_SELLER_ACCOUNTS'
```

---

## Session Data Additions

```typescript
interface SessionData {
  // existing
  userId?: number
  selectedPlanId?: number
  pendingPaymentId?: number
  selectedAccountId?: number

  // new - seller
  sellerId?: number              // DB seller ID (set when entering seller panel)
  selectedSellerPlanId?: number   // Plan chosen during account creation

  // new - admin seller management
  managingSellerId?: number      // Seller being viewed/edited by admin
  managingSellerPlanId?: number  // Plan being edited
  accountFilter?: 'all' | 'unpaid' | 'paid'
  selectedAccountIds?: number[]  // Batch selection for settlement
  currentPage?: number           // Pagination state
  searchQuery?: string           // Active search filter
}
```

---

## Implementation Order

1. **Prisma schema** — add `Seller`, `SellerPlan`, modify `Account`, new enum
2. **Seed data** — add new bot message keys
3. **Core services** — seller CRUD, seller plan CRUD, seller account queries
4. **START scene** — seller detection + welcome on first start
5. **HOME scene** — conditional seller/admin buttons, disable buy toast
6. **Seller scenes** — SELLER_PANEL → CREATE → ACCOUNTS → VIEW → REPORT
7. **Admin scenes** — ADMIN_SELLERS → DETAIL → PLANS → ACCOUNTS (batch settle)

---

## Assumptions

- **Single admin** identified by `ADMIN_CHAT_ID` env var.
- **Account duration** is fixed 30 days for all seller accounts.
- **Marzban username** format: `s_` + 6 random alphanumeric (lowercase), e.g. `s_a8f3k2`.
- **Seller can also use normal user features** (test account, manage their own accounts).
- **Deactivated seller** loses access to seller panel but keeps normal user access. Existing accounts remain.
- **No seller payment flow** — admin marks accounts as paid manually. Seller payment settlement is deferred.
