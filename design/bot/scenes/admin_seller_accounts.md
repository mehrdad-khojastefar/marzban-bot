# Admin Seller Accounts Scene

## Purpose
Admin views a seller's accounts with filtering, checkbox selection, and batch settlement.

## Entry
"📊 اکانت‌ها و تسویه" button from ADMIN_SELLER_DETAIL.

## UI — Account List
```
📊 اکانت‌های فروشنده: {seller_name}

فیلتر: [ همه ] [ ⬜ پرداخت‌نشده ] [ ✅ پرداخت‌شده ]

☑️ s_a8f3k2 - 5G - ۴۵۰,۰۰۰T  ⬜
☑️ s_k9m2x1 - 1G - ۲۰۰,۰۰۰T  ⬜
☐ s_p3q7w5 - 5G - ۴۵۰,۰۰۰T   ✅
...

۲ انتخاب شده - جمع: ۶۵۰,۰۰۰ تومان
[ ✅ تسویه انتخاب‌شده‌ها ]
[ ✅ تسویه همه پرداخت‌نشده‌ها ]

[ ◀ قبلی ]  صفحه ۱ از ۳  [ ▶ بعدی ]
[ 🔙 بازگشت ]
```

## UI — No Accounts
```
هنوز اکانتی ساخته نشده.

[ 🔙 بازگشت ]
```

## Messages
| Key | Default (Persian) | Variables |
|---|---|---|
| `admin.accounts_settled` | ✅ {count} اکانت تسویه شد. | count |

## Filter Buttons
| Label | Callback | Filter |
|---|---|---|
| همه | `filter_all` | Show all accounts |
| ⬜ پرداخت‌نشده | `filter_unpaid` | Show only `payment_status = unpaid` |
| ✅ پرداخت‌شده | `filter_paid` | Show only `payment_status = paid` |

Active filter is visually highlighted (e.g. `[» همه «]`).

## Account List Format
Each account row:
- Checkbox: ☑️ (selected) or ☐ (not selected)
- Marzban username
- Plan data limit abbreviated (e.g. `5G`)
- Plan price (formatted, abbreviated as `T`)
- Payment status: ⬜ unpaid, ✅ paid

Each account row is a tappable button that toggles the checkbox.

## Selection Summary
When accounts are selected, show:
- `{count} انتخاب شده - جمع: {total} تومان`
- Only shown when at least 1 account is selected

## Settlement Actions
| Label | Callback | Action |
|---|---|---|
| ✅ تسویه انتخاب‌شده‌ها | `settle_selected` | Batch mark selected accounts as `paid` |
| ✅ تسویه همه پرداخت‌نشده‌ها | `settle_all` | Batch mark ALL unpaid accounts as `paid` |

After settlement:
- Show `admin.accounts_settled` with count
- Clear selection
- Re-render list

## Pagination
- 8 accounts per page
- ◀ قبلی / ▶ بعدی navigation
- Page indicator in Persian digits
- Sorted by `created_at` descending
- Selection persists across pages

## Backend
- `db.account.findBySeller(sellerId, { filter, page })` — paginated + filtered
- `db.account.batchSettle(accountIds)` — batch update `payment_status = paid`
- `db.account.settleAllBySeller(sellerId)` — settle all unpaid for a seller

## Session
- Reads `managingSellerId`
- Uses `accountFilter` for current filter state
- Uses `selectedAccountIds` for checkbox state
- Uses `currentPage` for pagination

## Transitions
```
ADMIN_SELLER_ACCOUNTS → ADMIN_SELLER_DETAIL (back)
```

## Notes
- Selection state (`selectedAccountIds`) is in session memory — cleared on scene exit
- "تسویه همه" ignores selection and settles ALL unpaid, not just current page
- Already-paid accounts show ✅ but are not selectable (checkbox disabled)
- Filter change resets to page 1 but preserves selection
