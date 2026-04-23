# Design

## Bot Scene Design

Every scene has a detailed spec at `design/bot/scenes/<scene>.md`. This document is the quick reference.

---

### Scene Map

```
/start
  └── HOME
        ├── مدیریت اکانت‌ها → MANAGE_ACCOUNTS → VIEW_ACCOUNT
        ├── خرید اکانت     → BUY_ACCOUNT → PAYMENT_PENDING
        ├── اکانت تستی     → TEST_ACCOUNT
        └── پشتیبانی       → SUPPORT
```

All error paths → ERROR → HOME.

---

### Scene Reference

| Scene | File | Enter Behavior |
|---|---|---|
| Start | `src/bot/scenes/start.ts` | Register or welcome back, store session userId, → HOME |
| Home | `src/bot/scenes/home.ts` | Show greeting + 4 inline buttons |
| Buy Account | `src/bot/scenes/buyAccount.ts` | Fetch plans from DB, show as buttons, create Payment on select |
| Payment Pending | `src/bot/scenes/paymentPending.ts` | Accept receipt photo, forward to admin, wait for approval |
| Manage Accounts | `src/bot/scenes/manageAccounts.ts` | List accounts with live Marzban usage |
| View Account | `src/bot/scenes/viewAccount.ts` | Account detail + config link |
| Test Account | `src/bot/scenes/testAccount.ts` | Check has_test → provision 1h/100MB via Marzban |
| Support | `src/bot/scenes/support.ts` | Show support username |
| Error | `src/bot/scenes/error.ts` | Show error message, back → HOME |

---

## Message System

All user-facing text is stored in `bot_messages` DB table. Full registry at `design/bot/messages.md`.

### How it works

```typescript
import { getMessage } from '@/bot/services/messageService'

const text = await getMessage('start.welcome_new', { first_name: 'مهرداد' })
// → "سلام مهرداد! به ربات VPN خوش آمدید."
```

- **Cache:** In-memory Map, 5-minute TTL, auto-refetches on expiry
- **Placeholders:** `{variable}` syntax, replaced at runtime
- **Missing key:** Returns the key string (safe fallback)
- **Init:** `initMessageService(db)` once at startup

---

## Payment Flow

```
User selects plan
  → Payment created (status: pending)
  → User shown card number + amount
  → User sends receipt photo
  → Payment updated (status: awaiting_approval, receipt stored)
  → Photo forwarded to admin with approve/reject buttons
  → Admin taps approve
    → Payment approved, account provisioned via Marzban
    → User notified with success message
  → Admin taps reject
    → Payment rejected, user notified
```

Admin handler is global (not in a scene) — registered in `bot.ts` via `registerAdminPaymentHandler()`.

---

## Session Data

```typescript
interface SessionData {
  userId?: number           // DB user ID (set in Start scene)
  selectedPlanId?: number   // Plan chosen in Buy scene
  pendingPaymentId?: number // Payment awaiting receipt/approval
  selectedAccountId?: number // Account being viewed
}
```

---

## Marzban Service

Public API via singleton — see `docs/src/core/marzban/marzban_service.md` for full usage guide.

```typescript
import { initMarzban, getMarzban } from '@/core/marzban'

// At startup
initMarzban({ baseUrl, username, password })

// Anywhere
const marzban = getMarzban()
const user = await marzban.addUser({ username, data_limit, expire, status })
```

44 methods across: Admin, User, UserTemplate, Node, System, Core, Subscription.

---

## DB Singleton

Same pattern as Marzban:

```typescript
import { initDb, getDb } from '@/core/db'

initDb(databaseUrl)     // once at startup
const db = getDb()      // anywhere
```

---

## Formatting Utilities

```typescript
import { toPersianDigits, formatBytes, formatDaysLeft, formatPrice } from '@/core/utils'

toPersianDigits('123')        // '۱۲۳'
formatBytes(20 * 1073741824)  // '۲۰ GB'
formatDaysLeft(futureDate)    // '۱۵ روز'
formatPrice(50000)            // '۵۰,۰۰۰ تومان'
```

---

## Error Handling

```typescript
import { MarzbanError, isMarzbanError } from '@/core/marzban'

try {
  await marzban.getUser('alice')
} catch (err) {
  if (isMarzbanError(err)) {
    // err.statusCode: 400 | 401 | 403 | 404 | 409 | 422
  }
}
```

Bot-level: `errorHandler()` middleware catches unhandled errors, logs them, sends `error.message` from DB.
