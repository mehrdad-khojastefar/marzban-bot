# Home Scene

## Purpose
Main menu — the hub for all navigation. Shows role-conditional buttons for sellers and admin.

## UI
```
{home.greeting}

[ مدیریت اکانت‌ها ]
[ اکانت تستی  |  خرید اکانت ]
[ پشتیبانی ]

── seller-only ──
[ 🏪 پنل فروشنده ]

── admin-only ──
[ ⚙️ مدیریت فروشندگان ]
[ 💳 مدیریت کارت‌ها ]
[ 👤 مدیریت کاربران ]
[ 📦 مدیریت پلن‌گروپ‌ها ]
```

## Messages
| Key | Default (Persian) |
|---|---|
| `home.greeting` | از منوی زیر انتخاب کنید: |
| `buy.disabled` | این بخش فعلاً در دسترس نیست! |

## Buttons
| Label | Callback | Transitions to | Condition |
|---|---|---|---|
| مدیریت اکانت‌ها | `manage_accounts` | MANAGE_ACCOUNTS | always |
| اکانت تستی | `test_account` | TEST_ACCOUNT | always |
| خرید اکانت | `buy_account` | BUY_ACCOUNT or toast | gated by `buy_enabled` setting |
| پشتیبانی | `support` | SUPPORT | always |
| 🏪 پنل فروشنده | `seller_panel` | SELLER_PANEL | user is active seller |
| ⚙️ مدیریت فروشندگان | `admin_sellers` | ADMIN_SELLERS | admin only |
| 💳 مدیریت کارت‌ها | `admin_bank_cards` | ADMIN_BANK_CARDS | admin only |
| 👤 مدیریت کاربران | `admin_users` | ADMIN_USERS | admin only |
| 📦 مدیریت پلن‌گروپ‌ها | `admin_plan_groups` | ADMIN_PLAN_GROUPS | admin only |

## Transitions
```
HOME → MANAGE_ACCOUNTS
HOME → TEST_ACCOUNT
HOME → BUY_ACCOUNT       (if buy_enabled = true)
HOME → SUPPORT
HOME → SELLER_PANEL      (seller-only)
HOME → ADMIN_SELLERS     (admin-only)
HOME → ADMIN_BANK_CARDS  (admin-only)
HOME → ADMIN_USERS       (admin-only)
HOME → ADMIN_PLAN_GROUPS (admin-only)
```

## Role Detection
- **Admin:** Compare `chat_id` with `ADMIN_CHAT_ID` env var
- **Seller:** Query `sellers` table by `chat_id` where `is_active = true`

## Buy Gate
On "خرید اکانت" tap:
1. Read `buy_enabled` from `BotSetting` (via `settingService`)
2. If `"false"` → answer callback with `buy.disabled` toast (answerCbQuery with show_alert), no scene transition
3. If `"true"` → enter BUY_ACCOUNT scene as normal

## Notes
- This scene is the fallback for any invalid state
- Pressing a button replaces the current message (edit, don't send new)
- Seller/admin buttons are only rendered if the role matches
