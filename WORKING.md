# User Renew Feature

## Goal
Allow existing users to renew (extend) their VPN accounts. Renew is independent from buy — old users can renew even when new sales are disabled.

## Feature Flag
- New BotSetting: `renew_enabled` (`"true"` / `"false"`, default `"false"`)
- Completely separate from `buy_enabled`
- When `"false"` → "تمدید اکانت" button shows toast, no scene transition

## Renew Logic (Fair Accumulation)
When a user renews an account with a plan:

1. **Data limit:** `new_data_limit = current_marzban_data_limit + plan.data_limit`
   - Fetched live from Marzban (not DB) to respect any admin edits
   - Added cumulatively — unused data is preserved
   
2. **Expiry:** `new_expire = max(current_expire, now) + plan.duration_days`
   - If account is still active → extend from current expiry
   - If account is expired → extend from now
   - Never lose remaining time

3. **Account status:** If expired/limited/disabled → reactivated to `active`

4. **Data usage:** NOT reset — user keeps their usage history

## Entry Point
- New "تمدید اکانت" button in VIEW_ACCOUNT scene (next to rename button)
- Only shown when `renew_enabled = "true"`
- Only shown for accounts the user owns (type = 'paid')

## Scene: RENEW_ACCOUNT

### Step 1: Show Plans
Same plan selection as BUY_ACCOUNT — reads user's PlanGroup:
- **Per-GB group:** GB picker (1, 2, 3, 5, 10, 20, 50, 100)
- **Fixed group:** Plan list with name, data_limit, duration, price

### Step 2: Payment
Same payment flow as BUY_ACCOUNT:
- Check `payment_method` setting (manual / premzy)
- **Manual:** Pick random card from user's assigned cards → show payment instructions → PAYMENT_PENDING
- **Premzy:** Build checkout URL → show payment link

### Step 3: Approval & Renewal
On admin approval (or Premzy callback):
1. Fetch current Marzban user data (`marzban.getUser`)
2. Calculate new data_limit and expire (see logic above)
3. Call `marzban.modifyUser(username, { data_limit, expire, status: 'active' })`
4. Update Account record in DB (new `expires_at`, optionally `plan_id`)
5. Mark Transaction as `completed`, link to existing account
6. Notify user with updated account details

## Transaction Model
Reuse existing Transaction model with a new `type` field:
- Add `type` enum: `buy` | `renew` to Transaction
- Renew transactions store `account_id` from the start (the account being renewed)
- Buy transactions get `account_id` after provisioning (existing behavior)

## Session Data (new fields)
```typescript
renewAccountId?: number    // the account being renewed
```

## DB Changes
1. Add `TransactionType` enum (`buy`, `renew`) to Prisma schema
2. Add `type` field to Transaction model (default: `buy`)
3. Add `renew_enabled` to BotSetting seeds
4. Add renew-related bot_messages

## New Bot Messages
| Key | Default (Persian) |
|---|---|
| `renew.select_plan` | پلن تمدید را انتخاب کنید: |
| `renew.select_gb` | حجم تمدید را انتخاب کنید: |
| `renew.disabled` | تمدید اکانت فعلاً غیرفعال است. |
| `renew.success` | ✅ اکانت شما با موفقیت تمدید شد! |
| `renew.payment_instructions` | لطفاً مبلغ تمدید را واریز کنید: |

## Implementation Order
1. Schema: Add `TransactionType` enum + `type` field to Transaction
2. Seeds: Add `renew_enabled` setting + renew messages
3. Core: Create `renewAccount()` function in `src/core/provision.ts`
4. Scene: Create RENEW_ACCOUNT scene
5. Integration: Add "تمدید اکانت" button to VIEW_ACCOUNT
6. Integration: Wire up admin approval handler to detect renew transactions
7. Tests
