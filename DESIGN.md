# Design

## Performance & Scalability Design

Target: **10,000 concurrent users / accounts** on a single VPS. See `WORKING.md` for the prioritized work plan and SLOs; this section captures the *why* and the target architecture.

### Load Model

| Surface | Peak QPS (assumption) | Notes |
|---|---|---|
| Telegram updates (bot) | ~200 / sec | Burst on broadcast / channel events |
| Subscription endpoint (`src/sub`) | ~100 / sec | Clients refetch every few minutes |
| Premzy callbacks | ~5 / sec | Spiky around payments |
| Marzban API (outbound) | ~20 / sec | Buy/renew/getUser only |

### Architecture Targets

```
┌─────────────────────────────────────────────────────────────┐
│  Telegraf bot (single Node process, long-polling for now)   │
│  ├─ Middleware: requestId → user cache → channel check      │
│  ├─ In-process LRU: BotSetting, BotMessage, User-by-chatId  │
│  └─ Scene handlers — always `select`-disciplined            │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
   ┌──────────────────────┐    ┌─────────────────────────────┐
   │ Prisma + PgBouncer?  │    │ Marzban Axios client        │
   │ pool: 25, keepalive  │    │ keep-alive, retry, tokenTTL │
   └──────────┬───────────┘    └─────────────────────────────┘
              ▼
       ┌─────────────┐
       │ PostgreSQL  │
       │  + indexes  │
       └─────────────┘
```

### Database Indexing Strategy

The schema today indexes only `Transaction.status` and `Transaction.premzy_order_id`. Every other hot query path full-table-scans at 10K rows.

Required indexes (added in Step 1 of `WORKING.md`):

| Table | Index | Query it speeds up |
|---|---|---|
| `accounts` | `(user_id)` | "my accounts" list in user scenes |
| `accounts` | `(seller_id)` | seller report, admin seller accounts list |
| `accounts` | `(marzban_username)` | unique-username checks, Marzban sync lookups |
| `accounts` | `(marzban_sub_token)` | `src/sub/server.ts` per-request lookup |
| `accounts` | `(expires_at)` | expiry-sweep job (renew reminders) |
| `accounts` | `(seller_id, payment_status)` | seller unpaid totals |
| `users` | `(status)` | admin pending-approval queue |
| `payments` | `(user_id)`, `(status)`, `(user_id, status)` | user payment history, admin pending payments |
| `transactions` | `(user_id)`, `(account_id)`, `(user_id, status)` | renew/buy reconciliation, idempotency lookups |

**Rule:** any column used in a `where`, `orderBy`, or join condition in a per-update code path **must** be indexed. New scenes must follow the same rule.

### Connection Pool

- `PrismaPg` adapter configured with `connectionLimit: 25, idleTimeoutMs: 30_000`.
- A future PgBouncer (transaction mode) sits between Prisma and Postgres if we need to multiplex beyond 25. Deferred — not required at 10K with current query mix.
- Set `pool_timeout: 10` so a hung query fails fast instead of cascading.

### Caching Strategy (in-process only — no Redis)

| Cache | TTL / Invalidation | Hit-rate target |
|---|---|---|
| `BotSetting` (full map) | Bump on admin write via service-layer hook | > 99% |
| `BotMessage` (full map) | Bump on admin write via service-layer hook | > 99% |
| `User` by `chat_id` | 60 s positive, 30 s negative (banned/pending) | > 95% on repeat clicks |
| Marzban token | proactive refresh at 80% of TTL | every request reuses |

We deliberately avoid Redis: 10K users × kilobyte rows is well under the bot process's memory budget. If we ever go multi-process, switch caches to Postgres `LISTEN/NOTIFY` for invalidation, not Redis.

### Query Discipline

Every Prisma query in hot paths must:

1. Use `select: { ... }` — never fetch all columns implicitly.
2. Use `take: N` for any list query — no unbounded `findMany`.
3. Use `aggregate` / `groupBy` for sums and counts — never load rows into Node to reduce.
4. Run independent queries via `Promise.all`, not sequential `await`.
5. Wrap multi-write logical operations in `db.$transaction(...)` with an explicit `isolationLevel` if reading-then-writing.

### Marzban Client Design

- Single shared Axios instance, with `http.Agent({ keepAlive: true, maxSockets: 50 })` and `https.Agent` equivalent.
- Token cached in-memory with a `tokenIssuedAt` timestamp; refreshed proactively at 80% of TTL (assumed 30 min).
- Per-call timeout: 8 s. One retry on network/5xx. No retry on 4xx.
- All calls return a typed `Result<T, MarzbanError>` so scene code never throws on transient failures — it surfaces an i18n key from `bot_messages`.

### Transactional Boundaries

Buy and renew flows must be atomic at the DB layer:

1. Begin `db.$transaction`.
2. Insert `Transaction` row (status: `provisioning`).
3. Reserve / generate `marzban_username` and insert / update `Account`.
4. Commit DB transaction.
5. Call Marzban (`createUser` / `modifyUser`) outside the DB transaction.
6. On success: update `Transaction.status = completed` in a short follow-up tx.
7. On failure: update `Transaction.status = failed` and surface a retryable error to the admin / user.

Idempotency: any executor that processes a transaction must short-circuit if `Transaction.status` is already a terminal state.

### Observability Contract

Before declaring the bot "fast enough," we must have:

- Structured JSON logs (`pino`) with a `requestId` correlator on every log line.
- Prisma query event listener emitting a histogram (`prom-client`) for query duration by model/operation.
- Marzban call histogram (duration, status, endpoint).
- Counter: scene transitions, by scene and outcome.
- Gauge: in-process cache size and hit rate.
- `/metrics` HTTP endpoint on a private port (default `:9090`), scraped by whatever runs in prod.

### What We Are *Not* Building

- No Redis, no Kafka, no workers framework. Postgres + Node is enough at 10K.
- No HTTP/2 to Marzban (its server doesn't support it reliably; keep-alive HTTP/1.1 is fine).
- No horizontal scaling / shard key. Single-process is the design choice; revisit at 100K.
- No microservices split beyond the existing `bot` / `sub` / `premzy` boundary.

---

## New Scenes

| Scene | Purpose |
|---|---|
| RENEW_ACCOUNT | Plan selection for renewing an existing account |

### Existing Scenes (for reference)

| Scene | Purpose |
|---|---|
| ADMIN_BANK_CARDS | Bank card CRUD: list, add, toggle active, delete |
| ADMIN_USERS | User management: list users, view details, reassign card |
| ADMIN_PLAN_GROUPS | Plan group management: list, create (auto-generates code), edit plans |


## Renew Flow — Per-GB Group

```
User in VIEW_ACCOUNT taps "🔄 تمدید اکانت"
  → Check renew_enabled → if false, toast
  → Set session.renewAccountId = account.id
  → Enter RENEW_ACCOUNT scene
  → Fetch user.plan_group (type = per_gb)
  → Show current account summary:
      📛 نام: {account_name}
      📊 مصرف: {used} / {limit}
      ⏰ انقضا: {days_left}
  → Show GB picker (same options as buy):
      "حجم تمدید را انتخاب کنید:
       هر گیگابایت {price_per_gb} تومان"
      [ 1 گیگ ] [ 2 گیگ ] [ 3 گیگ ]
      [ 5 گیگ ] [ 10 گیگ ] [ 20 گیگ ]
      [ 50 گیگ ] [ 100 گیگ ]
      [ 🔙 بازگشت ]
  → User picks GB
  → Pick random active card from user's cards → if null, show error
  → Show payment instructions (same as buy)
  → Create Transaction (type: renew, account_id, status: awaiting_receipt, amount, data_limit, bank_card_id)
  → PAYMENT_PENDING
```

## Renew Flow — Fixed Group

```
User in VIEW_ACCOUNT taps "🔄 تمدید اکانت"
  → Check renew_enabled → if false, toast
  → Set session.renewAccountId = account.id
  → Enter RENEW_ACCOUNT scene
  → Fetch user.plan_group (type = fixed) + plans
  → Show current account summary (same as per_gb)
  → Show plan list:
      "پلن تمدید را انتخاب کنید:"
      [ 🔹 5 گیگ - 30 روزه - 600 تومان ]
      [ 🔹 10 گیگ - 30 روزه - 1,100 تومان ]
      [ 🔙 بازگشت ]
  → User picks plan
  → Pick random active card → if null, show error
  → Show payment instructions
  → Create Transaction (type: renew, account_id, plan_id, amount, bank_card_id)
  → PAYMENT_PENDING
```

## Renew Approval & Execution

```
Admin approves transaction (or Premzy callback fires)
  → Check transaction.type
  → If "buy": provisionAccount() (existing behavior — create new Marzban user)
  → If "renew": renewAccount()
      1. Fetch account from transaction.account_id
      2. marzban.getUser(account.marzban_username)
         → current_data_limit, current_expire
      3. Calculate:
         new_data_limit = current_data_limit + transaction.data_limit
         base_expire = max(current_expire, now_timestamp)
         new_expire = base_expire + (transaction.duration_days × 86400)
      4. marzban.modifyUser(username, {
           data_limit: new_data_limit,
           expire: new_expire,
           status: 'active'      ← reactivates if expired/limited
         })
      5. Update Account in DB:
         expires_at = new Date(new_expire × 1000)
      6. Mark Transaction as completed
      7. Notify user:
         ✅ اکانت شما تمدید شد!
         📛 نام: {name}
         📦 حجم جدید: {new_data_limit}
         ⏰ انقضای جدید: {new_expire_date}
```

