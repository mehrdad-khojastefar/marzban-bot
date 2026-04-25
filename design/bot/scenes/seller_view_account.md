# Seller View Account Scene

## Purpose
Detailed view of a single seller account with live usage data, subscription link, and note editing.

## Entry
Tap an account in SELLER_ACCOUNTS.

## UI
```
{seller.account_detail}

📛 نام: s_a8f3k2
📋 پلن: 5 گیگ
🔗 وضعیت: فعال ✅
📊 مصرف: ۲.۳ از ۵ گیگ (۴۶٪)
██████░░░░░░░░ ۴۶٪
⏰ انقضا: ۱۴ روز مانده (1405/02/15)
💰 پرداخت: پرداخت نشده ⬜
📝 یادداشت: علی تهران

[ 📎 ارسال لینک اشتراک ]
[ ✏️ ویرایش یادداشت ]
[ 🔙 بازگشت ]
```

## Messages
| Key | Default (Persian) | Variables |
|---|---|---|
| `seller.account_detail` | 📊 جزئیات اکانت | — |
| `seller.enter_new_note` | یادداشت جدید را وارد کنید: | — |
| `seller.note_saved` | یادداشت ذخیره شد. | — |

## Detail Fields
| Field | Source | Format |
|---|---|---|
| نام | `account.marzban_username` | As-is |
| پلن | `sellerPlan.name` | As-is |
| وضعیت | Marzban live status | فعال ✅ / غیرفعال ❌ / منقضی ⏰ |
| مصرف | Marzban `used_traffic` vs `data_limit` | `formatBytes(used)` از `formatBytes(limit)` (X%) |
| Progress bar | Calculated from usage percentage | █ and ░ characters, 14 chars wide |
| انقضا | `account.expires_at` | `X روز مانده (jalali date)` |
| پرداخت | `account.payment_status` | پرداخت نشده ⬜ / پرداخت شده ✅ |
| یادداشت | `account.note` | As-is, or "بدون یادداشت" if null |

## Progress Bar
```
Usage %    Bar
0%         ░░░░░░░░░░░░░░ ۰٪
46%        ██████░░░░░░░░ ۴۶٪
100%       ██████████████ ۱۰۰٪
```

## Buttons
| Label | Callback | Action |
|---|---|---|
| 📎 ارسال لینک اشتراک | `send_sub_link` | Fetch subscription link from Marzban, send as message |
| ✏️ ویرایش یادداشت | `edit_note` | Show `seller.enter_new_note` prompt, wait for text input |
| 🔙 بازگشت | `back_accounts` | Return to SELLER_ACCOUNTS |

## Edit Note Flow
1. Tap "✏️ ویرایش یادداشت"
2. Show `seller.enter_new_note` prompt
3. Seller types new note text
4. Update `account.note` in DB
5. Show `seller.note_saved` confirmation
6. Re-render account detail with updated note

## Backend
- `marzban.getUser(marzbanUsername)` — live usage/status
- `marzban.getUserSubscription(token)` — subscription link
- `db.account.updateNote(accountId, note)` — save note

## Session
- Reads `selectedAccountId` (set when tapping account in list)

## Transitions
```
SELLER_VIEW_ACCOUNT → SELLER_ACCOUNTS (back)
```

## Notes
- Usage data is fetched live from Marzban on every scene enter (not cached)
- If Marzban is unreachable, show last known data from DB with a warning
- Subscription link is sent as a separate text message (not edited into the detail view)
