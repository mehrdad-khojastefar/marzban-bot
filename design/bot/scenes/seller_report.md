# Seller Report Scene

## Purpose
Financial summary for the seller — total accounts, active/expired breakdown, and payment status.

## Entry
"📊 گزارش مالی" button from SELLER_PANEL.

## UI
```
{seller.report}

📋 کل اکانت‌ها: ۲۳
فعال: ۱۸  |  منقضی: ۵

💰 مالی:
جمع کل: ۱۰,۳۵۰,۰۰۰ تومان
پرداخت شده: ۷,۲۰۰,۰۰۰ تومان
مانده: ۳,۱۵۰,۰۰۰ تومان

[ 🔙 بازگشت ]
```

## Messages
| Key | Default (Persian) | Variables |
|---|---|---|
| `seller.report` | 📊 گزارش مالی | total, active, expired, total_amount, paid_amount, remaining |

## Report Fields
| Field | Calculation |
|---|---|
| کل اکانت‌ها | Count of all accounts by this seller |
| فعال | Accounts where `expires_at > now` |
| منقضی | Accounts where `expires_at <= now` |
| جمع کل | Sum of `sellerPlan.price` for all seller accounts |
| پرداخت شده | Sum of `sellerPlan.price` where `payment_status = paid` |
| مانده | جمع کل - پرداخت شده |

## Backend
- `db.account.getSellerReport(sellerId)` — aggregated query returning all fields

## Session
- Reads `sellerId`

## Transitions
```
SELLER_REPORT → SELLER_PANEL (back)
```

## Notes
- All monetary values formatted with `formatPrice()` (Persian digits + comma separator + "تومان")
- All counts formatted with `toPersianDigits()`
- Report is computed on every enter (not cached) — data freshness matters here
