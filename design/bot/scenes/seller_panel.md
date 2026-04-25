# Seller Panel Scene

## Purpose
Main menu for sellers — hub for account creation, account management, and financial reporting.

## Entry
"🏪 پنل فروشنده" button in HOME. Only visible to active sellers.

## Guard
On enter, verify the user is an active seller (query `sellers` by `chat_id`). If not → redirect to HOME.

## UI
```
{seller.panel_title}

[ ➕ ساخت اکانت ]
[ 📋 اکانت‌های من ]
[ 📊 گزارش مالی ]
[ 🔙 بازگشت ]
```

## Messages
| Key | Default (Persian) |
|---|---|
| `seller.panel_title` | 🏪 پنل فروشنده |

## Buttons
| Label | Callback | Transitions to |
|---|---|---|
| ➕ ساخت اکانت | `seller_create` | SELLER_CREATE_ACCOUNT |
| 📋 اکانت‌های من | `seller_accounts` | SELLER_ACCOUNTS |
| 📊 گزارش مالی | `seller_report` | SELLER_REPORT |
| 🔙 بازگشت | `back_home` | HOME |

## Session
Sets `sellerId` from the matched seller record.

## Transitions
```
SELLER_PANEL → SELLER_CREATE_ACCOUNT
SELLER_PANEL → SELLER_ACCOUNTS
SELLER_PANEL → SELLER_REPORT
SELLER_PANEL → HOME (back)
```
