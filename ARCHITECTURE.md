# Architecture

## NowPayments Integration — Architecture Decisions

### Why a third payment provider?
The `payment_method` BotSetting now accepts `"manual" | "premzy" | "nowpayment"` (global toggle). NowPayments adds crypto support without removing existing rails.

### Invoice mode (hosted checkout)
We use NowPayments' hosted invoice endpoint, not the on-chain Payment endpoint:
- Users leave Telegram briefly to complete payment on `nowpayments.io`
- Coin/network selection (USDT TRC20/ERC20/BEP20/Polygon, TRX, BTC, TON, etc.) happens on the NowPayments side — no in-bot coin picker
- Simpler integration: we never see addresses or handle confirmation counters

### FX strategy: Toman remains source of truth
Plans are priced in Toman. At order time we:
1. Fetch live USDT/IRT from Nobitex (`api.nobitex.ir/market/stats`)
2. Convert Rial → Toman → USD (treating USDT≈USD, standard for Iran)
3. Cache the rate 5 minutes
4. Persist `usd_amount`, `fx_rate`, `fx_source`, `fx_fetched_at` on the Transaction for auditability
5. Send the USD amount to NowPayments

No fallback FX provider in v1 — Nobitex failure throws `FxUnavailableError` and the user is asked to retry.

### IPN handling
- Endpoint: `POST /nowpayment/ipn` on `NOWPAYMENTS_CALLBACK_PORT` (default 8087)
- Signature: HMAC-SHA512 over the JSON body with **alphabetically sorted keys** (NowPayments quirk — `stringifySorted` re-canonicalizes the body before hashing)
- Idempotency: lookup by `order_id` (we set this to `Transaction.transaction_id` UUID); the service returns `ignored` when the transaction is already at/past where the IPN would move it
- Always returns 200 after processing so NowPayments stops retrying

### Status mapping (NowPayments → Transaction)
| NowPayments | Transaction | Action |
|---|---|---|
| `waiting`, `confirming`, `sending` | `checkout` | no-op (progress ping) |
| `confirmed` | `paid` | confirmed on-chain, awaiting `finished` |
| `finished` | `provisioning` → `completed` | call `provisionAccount` / `renewAccount` |
| `partially_paid` | `failed` | notify user (contact support) + admin |
| `expired` | `expired` | notify user (start a new order) |
| `failed` | `failed` | notify user + admin |
| `refunded` | `cancelled` | notify admin |
| `finished` after expiry/cancel | (unchanged) | flag as `late_finished` — notify user + admin, **do not auto-provision** |

### Late payment / partial payment
Both are routed to manual review per the agreed policy:
- User receives a Persian message asking them to contact support
- Admin gets a notification with the payment ID, amount, and currency
- We never auto-refund and never auto-activate after expiry

### Process model
Mirrors Premzy: a separate Node entrypoint (`src/nowpayment/main.ts`) runs the HTTP IPN server. It opens its own Prisma client and Telegraf instance. Run via `yarn nowpayment:start`.

### What we deliberately deferred
- Wallex / OpenExchangeRates fallback for FX
- Per-seller `payment_method` override
- Refund automation
- In-bot coin picker (would require switching to NowPayments' Payment-flow API)
- Admin panel view of NowPayments orders

## Renew Flow — Architecture Decisions

### Why separate from buy?
- `renew_enabled` is independent of `buy_enabled`
- Use case: disable new sales but let existing users renew
- Renew modifies an existing Marzban account; buy creates a new one

### Fair accumulation model
The renew logic is additive and never penalizes users:
- **Data:** New data is ADDED to the current Marzban data_limit (not the DB value — Marzban is source of truth for current limits since admin can edit them)
- **Expiry:** Extended from `max(current_expire, now)` — active accounts extend from their expiry, expired accounts extend from now. No time is lost.
- **Usage:** Data consumption counter is NOT reset — user keeps their usage history

### Why read from Marzban, not DB?
Admin can manually edit data_limit and expiry via ADMIN_VIEW_ACCOUNT. The DB `Account.expires_at` may be stale. Marzban is the authoritative source for current account state. On renew:
1. `marzban.getUser()` → get current `data_limit` and `expire`
2. Calculate new values
3. `marzban.modifyUser()` → apply changes
4. Update DB record to match

### Reactivation
If account status is `expired`, `limited`, or `disabled` in Marzban, the renew call sets `status: 'active'` to reactivate it.

### Transaction type discrimination
A new `TransactionType` enum (`buy` | `renew`) on the Transaction model lets the admin approval handler and Premzy callback determine whether to call `provisionAccount()` (buy) or `renewAccount()` (renew).

