# Commit Recap

## What changed
Added **NowPayments** as a third `payment_method` option (alongside `manual` and `premzy`). Users can now pay for new accounts and renewals with crypto via NowPayments' hosted invoice flow.

## Key decisions
- **Hosted invoice mode**, not on-chain Payment mode — coin/network selection happens on NowPayments' checkout page; we don't build an in-bot coin picker. User leaves Telegram briefly to pay.
- **Pricing source of truth = Toman.** Live USDT/IRT rate from Nobitex (`api.nobitex.ir/market/stats`) → Toman → USD (USDT≈USD). 5-min cache. FX context (`fx_rate`, `fx_source`, `fx_fetched_at`) persisted on the Transaction for audit.
- **No FX fallback in v1.** Nobitex failure throws `FxUnavailableError` and the user is told to retry. Wallex fallback is a documented follow-up.
- **Reuse `Transaction` model.** Added `nowpayment_invoice_id`, `nowpayment_payment_id`, `nowpayment_invoice_url`, `pay_currency`, `usd_amount`, `fx_rate`, `fx_source`, `fx_fetched_at`. No new `TransactionStatus` values — the existing 11-state enum covers every NowPayments status.
- **HMAC-SHA512 over sorted-keys JSON** for IPN signature verification (NowPayments quirk). Reusable `stringifySorted` helper handles nested objects recursively.
- **Idempotent state machine** (`decideIpnOutcome`): once a transaction is `completed` we ignore further IPNs (except `refunded`); once `provisioning` we ignore everything to prevent double-provisioning.
- **Late payment / partial payment → manual review.** No auto-activation after expiry; no auto-refunds. User gets a Persian "contact support" message; admin gets a notification with payment_id + amount.
- **Sibling process model.** New `yarn nowpayment:start` entrypoint mirrors `yarn premzy:start` — separate HTTP server, separate Prisma + Telegraf instances.

## Files changed
```
prisma/schema.prisma                              # Added 'nowpayment' enum value + 8 new columns + index
prisma/migrations/20260518000000_.../              # Migration SQL

src/core/utils/config.ts                          # NOWPAYMENTS_* + FX_PROVIDER env schema
src/core/fx/nobitex.ts                            # NEW: Nobitex USDT/IRT fetcher
src/core/fx/index.ts                              # NEW: tomanToUsd() + FX cache + FxUnavailableError
src/core/nowpayment/types.ts                      # NEW: API request/response + IPN payload types
src/core/nowpayment/client.ts                     # NEW: createInvoice, getPaymentStatus, verifyIpnSignature
src/core/nowpayment/service.ts                    # NEW: createInvoiceForTransaction + IPN state machine
src/core/nowpayment/index.ts                      # NEW: lazy singleton client builder + re-exports

src/nowpayment/main.ts                            # NEW: entrypoint
src/nowpayment/server.ts                          # NEW: HTTP IPN server (POST /nowpayment/ipn)

src/bot/scenes/buyAccount.ts                      # Added handleNowpaymentPayment branch
src/bot/scenes/renewAccount.ts                    # Added handleNowpaymentRenew branch
src/db/seeds/seed.ts                              # payment_method comment updated

src/core/fx/__tests__/nobitex.test.ts             # NEW: 9 tests (parse, cache, errors, FxUnavailableError)
src/core/nowpayment/__tests__/client.test.ts      # NEW: 10 tests (sorted-keys, sig verify, tamper, secrets)
src/core/nowpayment/__tests__/service.test.ts     # NEW: 16 tests (state machine, late_finished, verifyIpn)

.env.example                                      # Added NOWPAYMENTS_* + FX_PROVIDER vars
package.json                                      # Added nowpayment:start script

ARCHITECTURE.md                                   # Added NowPayments integration section
WORKING.md                                        # Expanded from one-liner to full spec
RECAP.md                                          # This file
```

## Status mapping (NowPayments → Transaction)
| NowPayments | Transaction | Action |
|---|---|---|
| `waiting`, `confirming`, `sending` | `checkout` | progress (no-op for user) |
| `confirmed` | `paid` | awaiting `finished` |
| `finished` | `provisioning` → `completed` | call provisionAccount/renewAccount |
| `partially_paid` | `failed` | user → contact support, admin alert |
| `expired` | `expired` | user → start new order |
| `failed` | `failed` | user → contact support, admin alert |
| `refunded` | `cancelled` | admin alert |
| `finished` after expiry/cancel | (unchanged) | `late_finished` — **no auto-provision**, manual review |

## Verification
- `eslint 'src/**/*.{ts,tsx}'` — no new errors from this change (pre-existing 4 errors all in untouched files)
- `vitest run` — **140 passed (140)**, 35 new tests added
- TypeScript pre-existing `socks-proxy-agent` resolution warning extends to the new server (mirrors `src/premzy/server.ts` import pattern exactly)

## How to deploy
1. Apply migration: `yarn db:migrate` (or `prisma migrate deploy`)
2. Set env: `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_PUBLIC_CALLBACK_URL` (publicly reachable URL pointing at `:8087/nowpayment/ipn`)
3. Start the IPN server: `yarn nowpayment:start`
4. Flip the BotSetting: `UPDATE bot_settings SET value='nowpayment' WHERE key='payment_method';` (or via existing admin tools)
5. In the NowPayments dashboard, enable the coins/networks you want offered (USDT TRC20/ERC20/BEP20/Polygon, TRX, BTC, TON, etc.) and set the IPN URL.
