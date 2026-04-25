# Admin Seller Plans Scene

## Purpose
Admin manages a seller's pricing plans — view, add, toggle active/inactive, and edit.

## Entry
"📋 پلن‌ها" button from ADMIN_SELLER_DETAIL.

## UI — Plan List
```
📋 پلن‌های فروشنده: {seller_name}

[ ➕ افزودن پلن ]

1. 5 گیگ - ۴۵۰,۰۰۰ T  ✅
2. 1 گیگ - ۲۰۰,۰۰۰ T  ✅
3. 10 گیگ - ۸۰۰,۰۰۰ T  ❌ غیرفعال

[ 🔙 بازگشت ]
```

## UI — No Plans
```
هنوز پلنی تعریف نشده.

[ ➕ افزودن پلن ]
[ 🔙 بازگشت ]
```

## Messages
| Key | Default (Persian) | Variables |
|---|---|---|
| `admin.plan_name_prompt` | نام پلن را وارد کنید: | — |
| `admin.plan_data_prompt` | حجم را به گیگابایت وارد کنید: | — |
| `admin.plan_price_prompt` | قیمت را به تومان وارد کنید: | — |
| `admin.plan_added` | ✅ پلن اضافه شد. | — |

## Plan List Format
Each plan shows:
- Index number (Persian digits)
- Plan name
- Price (formatted with `formatPrice`, abbreviated as `T`)
- Status icon: ✅ active, ❌ غیرفعال

Each plan is a tappable inline button → shows plan actions.

## Add Plan Flow (sequential prompts)
1. Admin taps "➕ افزودن پلن"
2. Prompt: `admin.plan_name_prompt` → admin types name (e.g. "5 گیگ")
3. Prompt: `admin.plan_data_prompt` → admin types GB number (e.g. "5")
   - Validate: must be a positive number
   - Convert to bytes: `value * 1024 * 1024 * 1024`
4. Prompt: `admin.plan_price_prompt` → admin types price (e.g. "450000")
   - Validate: must be a positive number
5. Create `SellerPlan` record
6. Show `admin.plan_added`, re-render plan list

## Tap Plan → Actions
When admin taps a plan:
```
پلن: 5 گیگ
حجم: ۵ GB
قیمت: ۴۵۰,۰۰۰ تومان
وضعیت: فعال

[ ❌ غیرفعال کردن ]   (or [ ✅ فعال کردن ])
[ 🔙 بازگشت به لیست ]
```

- Toggle active/inactive
- Re-render plan list after action

## Backend
- `db.sellerPlan.findBySeller(sellerId)` — all plans (active + inactive)
- `db.sellerPlan.create({ sellerId, name, data_limit, price })` — add plan
- `db.sellerPlan.update(planId, { is_active })` — toggle active

## Session
- Reads `managingSellerId`
- Sets `managingSellerPlanId` when tapping a plan

## Transitions
```
ADMIN_SELLER_PLANS → ADMIN_SELLER_DETAIL (back)
```

## Notes
- Deactivated plans are not shown to sellers in SELLER_CREATE_ACCOUNT
- Deactivating a plan does not affect existing accounts created with that plan
- Plan data is shown in GB in the admin view (converted from bytes)
