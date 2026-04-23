# Test Account Scene

## Purpose
One-time trial VPN account. 1 hour duration, 100MB data limit.

## Flow
1. Check if user already has a test account → if yes, show `test.already_used`, go HOME
2. If eligible → provision via Marzban (1 hour, 100MB, on_hold status)
3. Show config to user
4. Transition → HOME

## UI — Eligible
```
{test.creating}

⏳ در حال ساخت اکانت تستی...
```

Then:
```
{test.ready}

⏰ مدت: ۱ ساعت
📊 حجم: ۱۰۰ مگابایت

[ 📋 دریافت کانفیگ ]
[ 🔙 بازگشت ]
```

## UI — Already Used
```
{test.already_used}

[ 🔙 بازگشت ]
```

## Messages
| Key | Default (Persian) |
|---|---|
| `test.creating` | در حال ساخت اکانت تستی... |
| `test.ready` | ✅ اکانت تستی شما آماده است! |
| `test.already_used` | شما قبلاً از اکانت تستی استفاده کرده‌اید. |
| `test.failed` | خطا در ساخت اکانت تستی. لطفاً دوباره تلاش کنید. |

## Backend
- `db.account.hasTestAccount(userId)` — check eligibility
- `marzban.addUser({ username, data_limit: 104857600, expire: 3600, status: 'on_hold' })` — provision
- `db.account.create({ userId, marzbanId, type: 'test', ... })` — record locally

## Transitions
```
TEST_ACCOUNT → HOME (already used or after config shown)
TEST_ACCOUNT → ERROR (provisioning failure)
```

## Constraints
- 100MB = 104,857,600 bytes
- 1 hour = 3,600 seconds
- One test account per user, ever (checked via DB flag)
