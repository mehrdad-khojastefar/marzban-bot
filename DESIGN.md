# Design — Seller System MVP

## Scene Map (new + modified)

```
/start (modified)
  └── HOME (modified)
        ├── خرید اکانت         → toast (gated by buy_enabled)
        ├── پنل فروشنده        → SELLER_PANEL (seller-only, new)
        │     ├── ساخت اکانت   → SELLER_CREATE_ACCOUNT
        │     ├── اکانت‌ها      → SELLER_ACCOUNTS → SELLER_VIEW_ACCOUNT
        │     └── گزارش مالی    → SELLER_REPORT
        └── مدیریت فروشندگان   → ADMIN_SELLERS (admin-only, new)
              └── جزئیات       → ADMIN_SELLER_DETAIL
                    ├── پلن‌ها  → ADMIN_SELLER_PLANS
                    └── تسویه  → ADMIN_SELLER_ACCOUNTS
```

## Modified Scenes

### START
- After user creation/lookup, check `sellers` table by `chat_id`
- If seller record exists with `user_id = null` → link, show `seller.welcome`

### HOME
- "خرید اکانت" reads `buy_enabled` setting. If `"false"` → `answerCbQuery` toast
- "🏪 پنل فروشنده" button: only rendered if user is active seller
- "⚙️ مدیریت فروشندگان" button: only rendered if `chat_id === ADMIN_CHAT_ID`

## New Scenes (9)

| Scene | Purpose |
|---|---|
| SELLER_PANEL | Seller hub: create, accounts, report |
| SELLER_CREATE_ACCOUNT | Pick plan → instant Marzban provision → optional note → config |
| SELLER_ACCOUNTS | Paginated list (8/page) with search by note |
| SELLER_VIEW_ACCOUNT | Live usage + progress bar + subscription link + edit note |
| SELLER_REPORT | Financial summary: total/paid/outstanding |
| ADMIN_SELLERS | List sellers with debt, add by chat ID |
| ADMIN_SELLER_DETAIL | Seller profile + financial summary + management |
| ADMIN_SELLER_PLANS | Per-seller plan CRUD (add, toggle active) |
| ADMIN_SELLER_ACCOUNTS | Filtered list + checkbox select + batch settlement |

Full specs: `design/bot/scenes/*.md`

## Seller Account Creation Flow

```
Pick plan → Marzban addUser (s_XXXXXX, 30d, plan data_limit)
  → Save Account (payment_status: unpaid)
  → Prompt note (optional)
  → Send subscription link
```

## Admin Settlement Flow

```
Filter (all/unpaid/paid) → checkbox select → batch mark as paid
Or: "تسویه همه" → mark ALL unpaid as paid
```

## Setting System

```typescript
import { getSetting } from '@/bot/services/settingService'
const buyEnabled = await getSetting('buy_enabled')  // "true" | "false"
```

- DB-backed (`bot_settings` table), 30s cache TTL
- `initSettingService(db)` at startup

## Session Data Additions

```typescript
// seller flows
sellerId?: number
selectedSellerPlanId?: number

// admin seller management
managingSellerId?: number
managingSellerPlanId?: number
accountFilter?: 'all' | 'unpaid' | 'paid'
selectedAccountIds?: number[]
currentPage?: number
searchQuery?: string
```
