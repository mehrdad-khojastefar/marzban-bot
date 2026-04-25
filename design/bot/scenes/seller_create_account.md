# Seller Create Account Scene

## Purpose
Seller selects a plan and instantly provisions a Marzban VPN account. Optionally adds a note for tracking.

## Entry
"➕ ساخت اکانت" button from SELLER_PANEL.

## Flow
1. Fetch seller's active plans from DB
2. If no plans → show `seller.no_plans`, back button
3. Display plans as buttons
4. Seller selects a plan → instant Marzban provisioning:
   - Username: `s_` + 6 random lowercase alphanumeric (e.g. `s_a8f3k2`)
   - Data limit: from `SellerPlan.data_limit`
   - Duration: 30 days (fixed, `expire` = now + 30d as unix timestamp)
   - Status: `active`
5. Save `Account` record:
   - `user_id`: seller's linked user ID
   - `seller_id`: seller ID
   - `seller_plan_id`: selected plan ID
   - `payment_status`: `unpaid`
   - `type`: `paid`
   - `marzban_username`: generated username
   - `expires_at`: now + 30 days
6. Show success message with account details
7. Prompt for optional note (text input or skip)
8. Save note if provided
9. Send subscription link/config
10. Return to SELLER_PANEL

## UI — Plan Selection
```
{seller.select_plan}

[ 5 گیگ - ۴۵۰,۰۰۰ تومان ]
[ 1 گیگ - ۲۰۰,۰۰۰ تومان ]
[ 🔙 بازگشت ]
```

## UI — Account Created + Note Prompt
```
{seller.account_created}

نام: s_a8f3k2
پلن: 5 گیگ
انقضا: 1405/02/15

{seller.enter_note}
[ ⏭ رد کردن ]
```

## UI — No Plans
```
{seller.no_plans}

[ 🔙 بازگشت ]
```

## Messages
| Key | Default (Persian) | Variables |
|---|---|---|
| `seller.select_plan` | پلن مورد نظر را انتخاب کنید: | — |
| `seller.no_plans` | هنوز پلنی برای شما تعریف نشده. با ادمین تماس بگیرید. | — |
| `seller.account_created` | ✅ اکانت ساخته شد! | name, plan, expire_date |
| `seller.enter_note` | یادداشت بنویسید (یا رد شوید): | — |
| `seller.note_saved` | یادداشت ذخیره شد. | — |
| `seller.create_failed` | خطا در ساخت اکانت. لطفاً دوباره تلاش کنید. | — |

## Backend
- `db.sellerPlan.findActiveBySeller(sellerId)` — fetch plans
- `marzban.addUser({ username, data_limit, expire, status })` — provision
- `db.account.create(...)` — save record
- `marzban.getUserSubscription(token)` — get subscription link

## Session
- Reads `sellerId` (set in SELLER_PANEL)
- Sets `selectedSellerPlanId` on plan selection

## Transitions
```
SELLER_CREATE_ACCOUNT → SELLER_PANEL (back, after completion, or on error)
```

## Edge Cases
- Marzban provisioning fails → show `seller.create_failed`, return to SELLER_PANEL
- Username collision (unlikely with random) → retry with new random
- Seller deactivated between entering scene and selecting plan → redirect to HOME
