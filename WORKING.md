# User Self-Registration & Plan Groups

## Status
- [x] Buy scene — plan selection, payment creation
- [x] Payment pending scene — receipt upload, admin notification
- [x] Admin payment handler — approve/reject with account provisioning
- [x] buy_enabled gate in home scene
- [ ] **PlanGroup model** — deep link codes, per_gb vs fixed types
- [ ] **Self-registration flow** — users register via deep link, no admin gate
- [ ] **Random card assignment** — assign random active card at registration
- [ ] **Financial tracking on Payment** — store bank_card_id per payment
- [ ] **Per-GB buy flow** — user picks GB count, price calculated
- [ ] **Fixed buy flow** — user picks from pre-defined plans
- [ ] **Admin plan group management** — CRUD for plan groups + plans
- [ ] **Bank card management** — CRUD for cards (existing task)
- [ ] **Seed data** — create initial plan groups with correct pricing

## What Changed (from previous design)

### Old: Admin-gated access
- Admin manually adds users by chat ID
- Admin assigns a bank card to each user

### New: Self-registration via deep link
- Users open `t.me/doveng_bot?start=<8-hex-code>`
- Bot auto-registers user, assigns random bank card
- Deep link code maps to a PlanGroup (determines pricing)
- No admin approval needed to use the bot

## What Needs to Change

### 1. Database — Add PlanGroup model

```prisma
enum PlanGroupType {
  per_gb
  fixed
}

model PlanGroup {
  id            Int           @id @default(autoincrement())
  code          String        @unique   // 8 hex chars from UUIDv4 first segment
  name          String                  // admin label, e.g. "Per-GB Plan", "Fixed Packages"
  type          PlanGroupType
  price_per_gb  Int?                    // only for per_gb type (Toman)
  duration_days Int           @default(30)
  is_active     Boolean       @default(true)
  created_at    DateTime      @default(now())
  users         User[]
  plans         Plan[]

  @@map("plan_groups")
}
```

Update Plan model — add `group_id`:
```prisma
model Plan {
  // ... existing fields ...
  group_id   Int
  group      PlanGroup @relation(fields: [group_id], references: [id])
}
```

Update User model — add `plan_group_id`:
```prisma
model User {
  // ... existing fields ...
  plan_group_id  Int?
  plan_group     PlanGroup? @relation(fields: [plan_group_id], references: [id])
}
```

Update Payment model — add `bank_card_id` + make `plan_id` nullable:
```prisma
model Payment {
  // ... existing fields ...
  plan_id         Int?              // nullable for per_gb (no Plan record)
  bank_card_id    Int?              // which card was shown — financial tracking
  data_limit      BigInt?           // for per_gb: stores the GB count chosen
  bank_card       BankCard? @relation(fields: [bank_card_id], references: [id])
}
```

Add payments relation to BankCard:
```prisma
model BankCard {
  // ... existing fields ...
  payments    Payment[]
}
```

### 2. Start Scene — Self-Registration

Replace admin-gate with self-registration:

```
/start <code>
  → Look up PlanGroup by code
  → If no code and user not registered → show "use correct link" error
  → If invalid code → show error
  → If user exists → update profile, go HOME
  → If new user:
      - Create User with plan_group_id, random bank_card_id
      - Seller check (existing logic)
      - Go HOME
```

Code generation: `crypto.randomUUID().split('-')[0]` → e.g. `f47ac10b`

### 3. Buy Scene — Two Flows Based on PlanGroup Type

**Per-GB flow:**
1. Show message: "هر گیگ = {price_per_gb} تومان"
2. Show GB selection buttons (e.g. 1, 2, 3, 5, 10, 20, 50, 100)
3. User picks GB → calculate price = GB × price_per_gb
4. Show payment instructions with card
5. Create Payment with `data_limit = GB in bytes`, `amount = calculated price`, `bank_card_id`, `plan_id = null`

**Fixed flow:**
1. Fetch plans from user's PlanGroup
2. Show plan list as buttons (existing behavior)
3. User picks plan → show payment instructions with card
4. Create Payment with `plan_id`, `bank_card_id`, `amount = plan.price`

### 4. Payment — Financial Tracking

Every Payment now stores `bank_card_id` — the card that was shown to the user. This enables:
- Revenue per card: `SUM(amount) WHERE bank_card_id = X AND status = approved`
- User payment history with card info
- Card-level financial reports

### 5. Bank Card — Random Assignment

At registration:
```typescript
const activeCards = await db.bankCard.findMany({ where: { is_active: true } });
const randomCard = activeCards[Math.floor(Math.random() * activeCards.length)];
// randomCard may be undefined if no active cards
```

User gets `bank_card_id = randomCard?.id ?? null`.

### 6. Remove Admin User Management Scene

The ADMIN_USERS scene for manually adding users is no longer needed. Users self-register.

Admin still needs:
- ADMIN_BANK_CARDS — manage cards
- A new scene or extension for managing PlanGroups

## Files to Modify
- `prisma/schema.prisma` — add PlanGroup, update Plan/User/Payment/BankCard
- `src/bot/scenes/start.ts` — self-registration with deep link
- `src/bot/scenes/buyAccount.ts` — two flows (per_gb vs fixed), bank_card_id on Payment
- `src/bot/scenes/home.ts` — remove admin users button (or repurpose)
- `src/bot/context.ts` — session fields for GB selection
- `src/db/seeds/seed.ts` — seed plan groups + plans

## Files to Create
- `prisma/migrations/XXXX_add_plan_groups/` — migration
- `design/bot/scenes/buy_account.md` — update scene spec

## Migration Plan
1. Add PlanGroup table
2. Add plan_group_id to User (nullable for existing users)
3. Add group_id to Plan
4. Add bank_card_id + data_limit to Payment, make plan_id nullable
5. Seed two plan groups with correct pricing
6. Seed plans for fixed group

## Concrete Plan Data
- **Per-GB group**: price_per_gb = 300, duration_days = 30
- **Fixed group**: 
  - Plan: 5GB (5,368,709,120 bytes), 600 Toman, 30 days
  - Plan: 10GB (10,737,418,240 bytes), 1,100 Toman, 30 days

## Notes
- Deep link code = first 8 chars of UUIDv4 (hex), auto-generated
- Card number display: dashes for readability (`6037-XXXX-XXXX-XXXX`)
- Card number stored without dashes in DB
- Manual payment approval flow unchanged
- Seller flow unchanged
