# Manage Accounts Scene

## Purpose
List all active VPN accounts for the user. Tap to view details.

## Flow
1. Fetch user's accounts from DB (joined with Marzban usage data)
2. Display as a list with summary info
3. User taps an account → transition to `VIEW_ACCOUNT`

## UI
```
{manage.title}

🔹 {account.name}
   📊 {used}/{limit} | ⏰ {days_left} روز باقی‌مانده

🔹 {account.name}
   📊 {used}/{limit} | ⏰ {days_left} روز باقی‌مانده

[ {account.name} ]
[ {account.name} ]
[ 🔙 بازگشت ]
```

## Messages
| Key | Default (Persian) |
|---|---|
| `manage.title` | اکانت‌های شما: |
| `manage.no_accounts` | شما هنوز اکانتی ندارید. |

## Backend
- `db.account.findByUser(userId)` — get user's accounts
- `marzban.getUser(marzbanUsername)` — fetch live usage from Marzban

## Transitions
```
MANAGE_ACCOUNTS → VIEW_ACCOUNT (tap account)
MANAGE_ACCOUNTS → HOME (back button)
```
