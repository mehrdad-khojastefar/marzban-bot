# Admin Sellers Scene

## Purpose
Admin-only scene for managing sellers — list all sellers with debt overview, and add new sellers by chat ID.

## Entry
"⚙️ مدیریت فروشندگان" button in HOME. Only visible to admin (`ADMIN_CHAT_ID`).

## Guard
On enter, verify `chat_id === ADMIN_CHAT_ID`. If not → redirect to HOME.

## UI — Seller List
```
{admin.sellers_title}

[ ➕ افزودن فروشنده ]

علی محمدی (@ali_shop) - ۳,۱۵۰,۰۰۰ T
رضا کریمی (@reza_vpn) - ۰ T
۱۲۳۴۵۶ (هنوز شروع نکرده)
...

[ 🔙 بازگشت ]
```

## UI — No Sellers
```
{admin.no_sellers}

[ ➕ افزودن فروشنده ]
[ 🔙 بازگشت ]
```

## UI — Add Seller Prompt
```
{admin.add_seller_prompt}
```

## Messages
| Key | Default (Persian) | Variables |
|---|---|---|
| `admin.sellers_title` | ⚙️ مدیریت فروشندگان | — |
| `admin.no_sellers` | هنوز فروشنده‌ای اضافه نشده. | — |
| `admin.add_seller_prompt` | چت آیدی فروشنده جدید را وارد کنید: | — |
| `admin.seller_added` | ✅ فروشنده اضافه شد. | — |
| `admin.seller_exists` | این کاربر قبلاً فروشنده است. | — |
| `admin.invalid_chat_id` | چت آیدی نامعتبر است. عدد وارد کنید. | — |
| `admin.seller_notified` | فروشنده از ثبت خود مطلع شد. | — |
| `admin.seller_not_started` | فروشنده هنوز ربات را استارت نکرده. پس از استارت مطلع می‌شود. | — |

## Seller List Format
Each seller shows:
- **Started:** `{first_name} {last_name} (@{username}) - {debt} T`
- **Not started:** `{chat_id} (هنوز شروع نکرده)`
- Debt = sum of unpaid account prices (formatted with `formatPrice`)

Each seller is a tappable inline button → ADMIN_SELLER_DETAIL.

## Add Seller Flow
1. Admin taps "➕ افزودن فروشنده"
2. Show `admin.add_seller_prompt`
3. Admin types a chat ID (numeric)
4. Validate: must be a number
   - Invalid → show `admin.invalid_chat_id`, re-prompt
5. Check if already a seller
   - Yes → show `admin.seller_exists`
6. Create `Seller` record with `chat_id`
7. Check if a `User` exists with this `chat_id`
   - Yes → link `user_id` immediately, send notification to seller via bot (`seller.welcome`)
     - Show `admin.seller_notified` to admin
   - No → leave `user_id = null`, seller gets notified on first `/start`
     - Show `admin.seller_not_started` to admin
8. Re-render seller list

## Backend
- `db.seller.findAll()` — all sellers with user info + debt aggregation
- `db.seller.create(chatId)` — create seller record
- `db.seller.findByChatId(chatId)` — check existence
- `db.user.findByChatId(chatId)` — check if user exists for linking
- `bot.telegram.sendMessage(chatId, message)` — notify seller

## Transitions
```
ADMIN_SELLERS → ADMIN_SELLER_DETAIL (tap seller)
ADMIN_SELLERS → HOME (back)
```
