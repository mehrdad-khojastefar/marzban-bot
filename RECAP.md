# Commit Recap

## What changed
Added user account renewal feature — users can renew (extend) existing VPN accounts independently from the buy flow.

## Key decisions
- **Separate feature flag:** `renew_enabled` BotSetting, independent of `buy_enabled` — old users can renew even when new sales are disabled
- **Fair accumulation:** Data limit is ADDED to current Marzban data_limit (not replaced); expiry extends from `max(current_expire, now)` — no time or data is ever lost
- **Marzban as source of truth:** On renew, current data_limit and expire are fetched live from Marzban (not DB) since admins can manually edit these values
- **Transaction type discrimination:** New `TransactionType` enum (`buy` | `renew`) on Transaction model — admin approval handler and Premzy callback route to `provisionAccount()` or `renewAccount()` based on this
- **Entry from VIEW_ACCOUNT:** Renew button appears on paid accounts when `renew_enabled = "true"`, transitions to RENEW_ACCOUNT scene which mirrors BUY_ACCOUNT's plan selection + payment flow

## Files changed
```
prisma/schema.prisma                           # Added TransactionType enum + type field on Transaction
prisma/migrations/20260429100000_.../           # Migration SQL for the new enum + column

src/core/provision.ts                          # Added renewAccount() + buildRenewNotification()
src/bot/context.ts                             # Added renewAccountId to SessionData
src/bot/scenes/constants.ts                    # Added SCENE_RENEW_ACCOUNT
src/bot/scenes/index.ts                        # Registered renewAccountScene
src/bot/scenes/renewAccount.ts                 # NEW: full renew scene (per_gb + fixed + manual/premzy payment)
src/bot/scenes/viewAccount.ts                  # Added renew button + action handler
src/bot/handlers/adminPayment.ts               # Route approve handler for buy vs renew transactions
src/premzy/server.ts                           # Route Premzy callback for buy vs renew transactions
src/db/seeds/seed.ts                           # Added renew_enabled setting + 7 renew.* messages

WORKING.md                                     # Updated with full renew feature spec
ARCHITECTURE.md                                # Updated with renew architecture decisions
DESIGN.md                                      # Updated with renew scene map + flows
```
