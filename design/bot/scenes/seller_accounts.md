# Seller Accounts Scene

## Purpose
Paginated list of all accounts created by the seller, with search by note.

## Entry
"📋 اکانت‌های من" button from SELLER_PANEL.

## UI — Account List
```
{seller.accounts_title}

[ 🔍 جستجو ]

s_a8f3k2 - علی ۵ گیگ       ⬜
s_k9m2x1 - رضا ۱ گیگ       ✅
s_p3q7w5 - (بدون یادداشت)   ⬜
...

[ ◀ قبلی ]  صفحه ۱ از ۳  [ ▶ بعدی ]
[ 🔙 بازگشت ]
```

## UI — No Accounts
```
{seller.no_accounts}

[ 🔙 بازگشت ]
```

## UI — Search Active
```
🔍 نتایج جستجو: "علی" (۳ نتیجه)

s_a8f3k2 - علی تهران ۵ گیگ  ⬜
s_m4n8v2 - علی اصفهان ۱ گیگ  ✅
s_x7j3p9 - علیرضا ۵ گیگ     ⬜

[ ❌ پاک کردن جستجو ]
[ 🔙 بازگشت ]
```

## Messages
| Key | Default (Persian) | Variables |
|---|---|---|
| `seller.accounts_title` | 📋 اکانت‌های شما ({count} اکانت) | count |
| `seller.no_accounts` | هنوز اکانتی نساخته‌اید. | — |
| `seller.search_prompt` | متن جستجو را وارد کنید: | — |
| `seller.search_no_results` | نتیجه‌ای یافت نشد. | — |

## Account List Format
Each account shows:
- Marzban username (e.g. `s_a8f3k2`)
- Note text (or "بدون یادداشت" if empty)
- Plan name abbreviated (e.g. `۵ گیگ`)
- Payment status icon: ⬜ unpaid, ✅ paid

Each account is a tappable inline button → SELLER_VIEW_ACCOUNT.

## Pagination
- 8 accounts per page
- Navigation: ◀ قبلی / ▶ بعدی buttons
- Page indicator: "صفحه X از Y" (in Persian digits)
- Sorted by `created_at` descending (newest first)

## Search
1. Tap "🔍 جستجو" → show `seller.search_prompt`
2. Seller types search text (free text input)
3. Filter accounts where `note` contains the query (case-insensitive, partial match)
4. Show filtered results (same layout, no pagination — search results are typically small)
5. "❌ پاک کردن جستجو" → clear filter, return to full paginated list

## Backend
- `db.account.findBySeller(sellerId, { page, search })` — paginated + filtered query

## Session
- Reads `sellerId`
- Uses `currentPage` for pagination
- Uses `searchQuery` for active search filter

## Transitions
```
SELLER_ACCOUNTS → SELLER_VIEW_ACCOUNT (tap account)
SELLER_ACCOUNTS → SELLER_PANEL (back)
```
