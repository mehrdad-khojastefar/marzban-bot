# Admin Seller Detail Scene

## Purpose
Admin views a seller's profile, financial summary, and accesses management actions (plans, accounts, note, deactivate).

## Entry
Tap a seller in ADMIN_SELLERS.

## UI — Active Seller (started)
```
{admin.seller_detail}

👤 نام: علی محمدی
🆔 یوزرنیم: @ali_shop
💬 چت آیدی: 123456789
📝 یادداشت: نماینده تهران
🔗 وضعیت: فعال ✅

📊 خلاصه مالی:
اکانت‌ها: ۲۳ (۱۸ فعال)
بدهی: ۳,۱۵۰,۰۰۰ تومان

[ 📋 پلن‌ها ]
[ 📊 اکانت‌ها و تسویه ]
[ ✏️ ویرایش یادداشت ]
[ 🔴 غیرفعال کردن ]
[ 🔙 بازگشت ]
```

## UI — Seller Not Started
```
{admin.seller_detail}

💬 چت آیدی: 123456789
📝 یادداشت: —
🔗 وضعیت: هنوز شروع نکرده ⏳

[ 📋 پلن‌ها ]
[ ✏️ ویرایش یادداشت ]
[ 🔴 غیرفعال کردن ]
[ 🔙 بازگشت ]
```

## Messages
| Key | Default (Persian) | Variables |
|---|---|---|
| `admin.seller_detail` | 👤 جزئیات فروشنده | — |
| `admin.seller_deactivated` | فروشنده غیرفعال شد. | — |
| `admin.seller_activated` | فروشنده فعال شد. | — |
| `admin.enter_seller_note` | یادداشت را وارد کنید: | — |
| `admin.note_saved` | یادداشت ذخیره شد. | — |

## Detail Fields
| Field | Source |
|---|---|
| نام | `user.first_name` + `user.last_name` (or "—" if not started) |
| یوزرنیم | `@` + `user.username` (or hidden if not started) |
| چت آیدی | `seller.chat_id` |
| یادداشت | `seller.note` (or "—" if null) |
| وضعیت | `seller.is_active` + `seller.user_id` presence |
| اکانت‌ها | Count + active count |
| بدهی | Sum of unpaid account prices |

## Buttons
| Label | Callback | Action |
|---|---|---|
| 📋 پلن‌ها | `seller_plans` | → ADMIN_SELLER_PLANS |
| 📊 اکانت‌ها و تسویه | `seller_accounts` | → ADMIN_SELLER_ACCOUNTS (hidden if seller not started) |
| ✏️ ویرایش یادداشت | `edit_note` | Prompt for note text |
| 🔴 غیرفعال کردن | `deactivate` | Toggle `is_active` to false |
| 🟢 فعال کردن | `activate` | Toggle `is_active` to true (shown when deactivated) |
| 🔙 بازگشت | `back_sellers` | → ADMIN_SELLERS |

## Edit Note Flow
1. Admin taps "✏️ ویرایش یادداشت"
2. Show `admin.enter_seller_note`
3. Admin types note text
4. Update `seller.note` in DB
5. Show `admin.note_saved`, re-render detail

## Deactivate/Activate
- Toggle `seller.is_active`
- Show confirmation message
- Re-render detail with updated status and swapped button
- Deactivated seller loses seller panel access but keeps normal user access

## Backend
- `db.seller.findById(sellerId)` with user relation + account aggregation
- `db.seller.update(sellerId, { note })` — update note
- `db.seller.update(sellerId, { is_active })` — toggle active

## Session
- Reads `managingSellerId`

## Transitions
```
ADMIN_SELLER_DETAIL → ADMIN_SELLER_PLANS
ADMIN_SELLER_DETAIL → ADMIN_SELLER_ACCOUNTS
ADMIN_SELLER_DETAIL → ADMIN_SELLERS (back)
```
