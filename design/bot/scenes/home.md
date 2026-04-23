# Home Scene

## Purpose
Main menu — the hub for all navigation.

## UI
```
{home.greeting}

[ مدیریت اکانت‌ها ]
[ اکانت تستی  |  خرید اکانت ]
[ پشتیبانی ]
```

## Messages
| Key | Default (Persian) |
|---|---|
| `home.greeting` | از منوی زیر انتخاب کنید: |

## Buttons
| Label | Callback | Transitions to |
|---|---|---|
| مدیریت اکانت‌ها | `manage_accounts` | MANAGE_ACCOUNTS |
| اکانت تستی | `test_account` | TEST_ACCOUNT |
| خرید اکانت | `buy_account` | BUY_ACCOUNT |
| پشتیبانی | `support` | SUPPORT |

## Transitions
```
HOME → MANAGE_ACCOUNTS
HOME → TEST_ACCOUNT
HOME → BUY_ACCOUNT
HOME → SUPPORT
```

## Notes
- This scene is the fallback for any invalid state
- Pressing a button replaces the current message (edit, don't send new)
