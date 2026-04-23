# View Account Scene

## Purpose
Show detailed info for a single VPN account including connection config.

## UI
```
{view.title}

📛 نام: {account.name}
📊 مصرف: {used} / {limit}
⏰ انقضا: {expire_date}
🔗 وضعیت: {status}

[ 📋 دریافت کانفیگ ]
[ 🔙 بازگشت ]
```

## Messages
| Key | Default (Persian) |
|---|---|
| `view.title` | جزئیات اکانت |
| `view.config_caption` | کانفیگ اتصال شما: |
| `view.expired` | این اکانت منقضی شده است. |

## Backend
- `marzban.getUser(marzbanUsername)` — live usage/status
- `marzban.getUserSubscription(token)` — get connection config links

## Transitions
```
VIEW_ACCOUNT → MANAGE_ACCOUNTS (back button)
```

## Notes
- Config is sent as a text message (subscription link) or inline code block
- If account is expired, show `view.expired` and hide config button
