# NowPayments Integration — Crypto Payment Provider

## 1. Goal

Add **NowPayments** as a third option for `payment_method`, alongside
`manual` and `premzy`. Use NowPayments' **hosted invoice** flow (the user
is redirected to `nowpayments.io` to complete payment). Pricing source of
truth remains **Toman**; we convert Toman → USD live via **Nobitex** and
hand USD to NowPayments. The user picks the coin/network on the hosted
checkout — we do not build a coin picker in the bot.

Reference: https://documenter.getpostman.com/view/7907941/2s93JusNJt

## 2. Non-goals

- No Payment-flow (on-chain address inside Telegram) — Invoice mode only.
- No per-seller toggle. `payment_method` stays global via `BotSetting`.
- No admin UI for NowPayments config — keys live in env.
- No automatic refund logic — partial/late payments go to manual review.

## 3. Scope changes vs current behavior

- `BotSetting.payment_method` accepted values become:
  `"manual" | "premzy" | "nowpayment"`.
- `PaymentMethod` Prisma enum gains `nowpayment`.
- Buy flow branches on `payment_method` and routes to the new scene when
  set to `nowpayment`.

## 4. Environment variables

Add to `.env.example` (never hardcoded):

```bash
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
NOWPAYMENTS_CALLBACK_PORT=8087
NOWPAYMENTS_SANDBOX=false        # true uses https://api-sandbox.nowpayments.io
NOWPAYMENTS_SUCCESS_URL=         # optional — where the hosted page returns the user
NOWPAYMENTS_CANCEL_URL=          # optional
NOWPAYMENTS_INVOICE_TTL_MIN=20   # invoice expiry — informational, NowPayments owns the real timer
FX_PROVIDER=nobitex              # reserved for future fallback
```

## 5. DB changes

### 5.1 `PaymentMethod` enum
Add `nowpayment` value.

### 5.2 `Transaction` model — new optional fields
```
nowpayment_invoice_id   String?  @unique   // NowPayments invoice id
nowpayment_payment_id   String?  @unique   // NowPayments payment id (arrives via IPN)
nowpayment_invoice_url  String?            // hosted checkout URL we send to user
pay_currency            String?            // coin user actually paid in, e.g. "usdttrc20"
usd_amount              Decimal? @db.Decimal(12, 2)   // amount we sent to NowPayments
toman_amount            Int?                          // mirrors `amount`, kept for clarity
fx_rate                 Decimal? @db.Decimal(18, 4)   // Toman per 1 USD at order time
fx_source               String?                       // "nobitex"
fx_fetched_at           DateTime?
```
Add `@@index([nowpayment_payment_id])`.

### 5.3 `TransactionStatus`
Reuse existing states. Mapping from NowPayments → our status:

| NowPayments status | Our `TransactionStatus`       | Action |
|---|---|---|
| `waiting`          | `checkout`                    | invoice issued, waiting on chain |
| `confirming`       | `checkout`                    | seen on chain, awaiting confirmations |
| `confirmed`        | `paid`                        | confirmed, provision starts next |
| `sending`          | `paid`                        | NowPayments releasing funds — no-op |
| `finished`         | `completed` (after provision) | success path; provision Marzban account |
| `partially_paid`   | `failed` + flag               | notify user → contact support |
| `expired`          | `expired`                     | notify user → invoice expired, retry |
| `failed`           | `failed`                      | notify user → contact support |
| `refunded`         | `cancelled`                   | notify admin |

No new enum values required.

### 5.4 Migration
One Prisma migration: `add_nowpayment_to_transactions`.

## 6. Architecture

```
src/
├── core/
│   ├── fx/
│   │   ├── nobitex.ts          # client + 5-min in-memory cache
│   │   └── index.ts            # tomanToUsd(amount): Promise<{usd, rate, source, fetchedAt}>
│   └── nowpayment/
│       ├── client.ts           # createInvoice, getPayment, verifyIpnSignature
│       ├── types.ts            # request/response types
│       └── service.ts          # createOrderForUser, handleIpn (state machine)
├── bot/scenes/
│   └── buy_account_nowpayment.ts   # new scene branch
└── nowpayment/
    ├── main.ts                 # entrypoint (mirrors src/premzy/main.ts)
    └── server.ts               # Express IPN endpoint
```

The IPN server runs as a sibling process to the bot, just like Premzy
already does, on `NOWPAYMENTS_CALLBACK_PORT`.

## 7. User flow (happy path)

1. User opens **buy account** scene and picks a plan.
2. Bot reads `payment_method` from `BotSetting`. If `nowpayment` →
   route to `buy_account_nowpayment` scene.
3. Bot calls `fx.tomanToUsd(plan.price)` → gets `{usd, rate}`.
4. Bot creates a `Transaction` with
   `method = nowpayment`, `status = pending`, fx fields filled.
5. Bot calls `nowpayment.createInvoice({ price_amount: usd,
   price_currency: 'usd', order_id: transaction.transaction_id,
   ipn_callback_url, success_url, cancel_url })`.
6. Persist `nowpayment_invoice_id`, `nowpayment_invoice_url`, move
   `status → checkout`.
7. Bot edits the current message to a confirmation screen (single-message
   UI rule), then sends a **separate** message containing the invoice URL
   for copying (same exception we use for config/subscription links).
   The message includes:
   - the USD amount and which coins are accepted
   - the 20-minute expiry warning
   - clear instructions: "open the link → pick coin → pay → return here"
   - a "I have paid" button is **not** needed (IPN drives state)
8. NowPayments fires IPN(s) → server verifies HMAC-SHA512 → service
   updates `Transaction` state → on `finished`:
   - call existing provision pipeline (`src/core/provision.ts`)
   - on success, set `status = completed`, link `account_id`
   - send user the success message (subscription link + configs)
9. Admin notified on every terminal event (success/failure/partial/refund).

## 8. IPN contract

- **Endpoint:** `POST /nowpayment/ipn`
- **Signature:** header `x-nowpayments-sig` = HMAC-SHA512 of the JSON
  body using `NOWPAYMENTS_IPN_SECRET`. Body must be hashed with **sorted
  keys** (this is a known NowPayments quirk — handle explicitly).
- **Idempotency:** look up by `payment_id`. Ignore status transitions
  that move backwards (e.g., `finished` → `confirming`).
- **Late arrival:** if a `finished` IPN arrives for an `expired`
  transaction, do NOT auto-activate. Mark a flag, message user to contact
  support, ping admin.
- **Unknown order:** log + 200 OK (don't let NowPayments retry forever).
- **Always return 200** after persisting, even on no-op, so NowPayments
  stops retrying.

## 9. FX module (Nobitex)

- Endpoint: `GET https://api.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls`
- Read the `latest` price for `usdt-rls`, divide by 10 to get Toman/USDT,
  treat USDT≈USD (standard practice in Iran).
- Cache the rate in-memory for **5 minutes**.
- On Nobitex failure: throw a typed error; the buy scene shows
  `nowpayment.fx_unavailable` and aborts (no fallback in v1 — Wallex can
  be added later).
- Store `fx_rate`, `fx_source`, `fx_fetched_at` on the Transaction at
  order-creation time for auditability.

## 10. Messages (Persian — to seed in `bot_messages`)

Insert via a seed script. Final wording will be polished by `text-crafter`
during implementation, but keys must be:

| Key | Purpose |
|---|---|
| `nowpayment.invoice_created`        | "Open the link, pay within 20 min" + URL |
| `nowpayment.waiting_confirmation`   | "Payment seen on chain, waiting for confirmations" (optional progress ping) |
| `nowpayment.success`                | Plan activated — subscription link + configs |
| `nowpayment.partial_payment`        | "Underpayment detected — contact support" |
| `nowpayment.expired`                | "Invoice expired, you can start a new order" |
| `nowpayment.failed`                 | "Payment failed — contact support" |
| `nowpayment.late_payment`           | "Payment arrived after expiry — contact support" |
| `nowpayment.fx_unavailable`         | "Live exchange rate unavailable, try again shortly" |
| `nowpayment.create_invoice_failed`  | "Could not create invoice — try again" |

## 11. Admin notifications

Send to `ADMIN_CHAT_ID` on:
- `partially_paid` — user, amount expected vs received, payment_id
- `failed` / `refunded` — user, payment_id, reason
- `late_payment` (finished after expired) — user, payment_id, amount
- `fx_unavailable` repeated > N times in 10 min — operational alert

## 12. Acceptance criteria

- [ ] `payment_method = nowpayment` routes buy flow to the new scene.
- [ ] Plan price in Toman is converted to USD using a live Nobitex rate,
      cached 5 min, persisted on the Transaction.
- [ ] Invoice is created and the user receives a Telegram message with
      the hosted URL and clear instructions.
- [ ] IPN signature verification rejects forged payloads (unit test).
- [ ] IPN state machine handles all 8 NowPayments statuses without
      double-provisioning (idempotency test).
- [ ] `partially_paid`, `expired`, `failed`, and late-`finished` send the
      correct user message AND notify admin.
- [ ] On `finished` (within expiry), Marzban account is provisioned and
      success message with subscription link + configs is sent.
- [ ] Switching `payment_method` between `manual`/`premzy`/`nowpayment`
      at runtime works without restart.
- [ ] `yarn lint` and `yarn test` both pass.

## 13. Test plan (Vitest)

Unit tests in `src/__tests__/` mirroring source paths:
- `core/fx/nobitex.test.ts` — rate parse + cache + error path
- `core/nowpayment/client.test.ts` — createInvoice request shape,
  signature verification (positive + tampered)
- `core/nowpayment/service.test.ts` — state machine for each status,
  idempotency on duplicate IPN, late-finished handling
- `bot/scenes/buy_account_nowpayment.test.ts` — branch selection,
  fx failure path, invoice failure path

Mocks: Prisma, Axios (Nobitex + NowPayments), Telegraf context.
No real network in tests.

## 14. Out-of-scope follow-ups (do not implement now)

- Wallex / OpenExchangeRates fallback for FX.
- Per-seller `payment_method` override.
- Refund automation.
- In-bot coin picker (would require switching to Payment mode).
- Admin panel page for viewing NowPayments orders.
