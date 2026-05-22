# Admin Group Modify Scene

## Purpose
Admin-only scene that lets the admin (1) pick a filter (prefix / seller / user chat-id), (2) refine the matched accounts via checkboxes, (3) stack a queue of modifications (add GB, add days, ban/unban, reset traffic), (4) confirm, and (5) apply all changes in one batch with a per-account success/failure report.

## Entry
"✏️ ویرایش گروهی اکانت‌ها" button in HOME. Admin-only (`ADMIN_CHAT_ID` guard on enter).

## Guard
On enter, verify `chat_id === ADMIN_CHAT_ID`. If not → redirect to HOME. All session state is reset on entry.

## Step Machine

State lives in `ctx.session.groupModifyStep`:

| Step | What it does |
|---|---|
| `pick_filter` | Choose between prefix / seller / user filter |
| `enter_prefix` | Text input: username prefix |
| `pick_seller` | List of all sellers; admin taps one |
| `enter_user_chat_id` | Text input: user's Telegram chat id |
| `preview` | Paginated checkbox list of matched accounts |
| `build_queue` | Add / edit / clear ops; trigger apply |
| `enter_gb` | Text input: gigabytes to add |
| `enter_days` | Text input: days to add |
| `confirm` | Yes/No confirmation gate before execute |
| `report` | Final success/failure summary |

## UI — Pick Filter
```
✏️ ویرایش گروهی اکانت‌ها

چگونه اکانت‌ها را انتخاب می‌کنید؟

[ 🔤 پیشوند یوزرنیم ]
[ 👥 فروشنده ]
[ 🆔 کاربر (چت آیدی) ]
[ 🔙 بازگشت ]
```

## UI — Enter Prefix
```
پیشوند یوزرنیم را وارد کنید (مثلاً PRO_):

[ 🔙 بازگشت ]
```
Text input. Empty input re-prompts. Resolves to all accounts where `marzban_username` starts with the value.

## UI — Pick Seller
```
فروشنده مورد نظر را انتخاب کنید:

[ علی محمدی — ۲۳ اکانت ]
[ رضا کریمی — ۸ اکانت ]
[ ۱۲۳۴۵۶ — ۰ اکانت ❌ ]
[ 🔙 بازگشت ]
```
Includes inactive sellers (marked with ❌). Tapping resolves to all `account.seller_id = seller.id`.

## UI — Enter User Chat ID
```
چت آیدی کاربر را وارد کنید:

[ 🔙 بازگشت ]
```
Numeric input (Persian digits normalized). Resolves: `user.findUnique({ chat_id })` → `account.findMany({ user_id })`. No user → "no matches".

## UI — Preview (Checkbox List)
```
🎯 12 از 12 اکانت انتخاب شده.

با تیک کنار هر اکانت، آن را در/خارج از این عملیات قرار دهید.

[ ☑️ dove_123456 ]
[ ☑️ dove_654321 ]
[ ☐ dove_789012 ]
…

[ ✅ انتخاب همه ] [ ❌ لغو انتخاب همه ]
[ ◀ قبلی ] [ 1/2 ] [ بعدی ▶ ]
[ ➡️ ادامه ]            ← only when ≥1 selected
[ 🔙 بازگشت ]
```

Pagination: 8/page. Selection persists across pages. "انتخاب همه" / "لغو انتخاب همه" operate over the full matched set, not just the current page.

## UI — Build Queue
```
🎯 هدف: 12 اکانت

📝 عملیات‌های در صف:
• +5 گیگ
• +30 روز
• وضعیت → 🚫 بن
• 🔄 ریست مصرف

[ ➕ گیگ (+5) ] [ ➕ روز (+30) ]
[ ☑️ 🚫 بن  ] [ ✅ رفع بن    ]
[ ☑️ 🔄 ریست مصرف ]
[ 🗑️ پاک‌سازی صف ]
[ ✅ اعمال تغییرات ]
[ 🔙 بازگشت به انتخاب ]
```

### Queue rules (V1)
- Each op type appears **at most once** in the queue.
- `add_gb` / `add_days`: tapping the button opens the value editor with the current value pre-filled. Entering `0` removes the op.
- `🚫 بن` and `✅ رفع بن`: share one slot. Tapping one sets `status` and unsets the other. Tapping the same one again clears the slot.
- `🔄 ریست مصرف`: boolean toggle.
- "🗑️ پاک‌سازی صف" clears all ops.
- "✅ اعمال تغییرات" is hidden until at least one op is queued.

## UI — Enter GB / Days
```
چند گیگابایت اضافه شود؟ عدد را وارد کنید:

مقدار فعلی: 5 (برای حذف، عدد 0 بفرستید)

[ 🔙 انصراف ]
```
Non-numeric input shows `admin.group_modify.invalid_number` and re-prompts.

## UI — Confirm
```
⚠️ آیا از اعمال 4 تغییر روی 12 اکانت مطمئن هستید؟

این عملیات قابل بازگشت نیست.

[ ✅ بله، اعمال شود ] [ 🔙 خیر ]
```

## UI — Applying (progress)
```
⏳ در حال اعمال تغییرات...

45 / 200
```
Progress is edited in place every `PROGRESS_EVERY` (5) accounts and once on the final iteration. Failures during a single account do **not** abort — the loop continues (continue-on-error).

## UI — Report
```
🏁 گزارش نهایی:

✅ موفق: 198
❌ ناموفق: 2

[ 📋 جزئیات ناموفق‌ها ]   ← shown only when fail > 0
[ 🏠 بازگشت به منو ]
```

## UI — Failed Detail
```
📋 جزئیات اکانت‌های ناموفق:

• dove_111111: Request failed with status 404
• dove_222222: Request failed with status 500

[ 🏠 بازگشت به منو ]
```
Capped at first 30 failures with a `… و N مورد دیگر` tail.

## Messages
| Key | Default (Persian) | Variables |
|---|---|---|
| `admin.group_modify.title` | ✏️ ویرایش گروهی اکانت‌ها | — |
| `admin.group_modify.pick_filter` | چگونه اکانت‌ها را انتخاب می‌کنید؟ | — |
| `admin.group_modify.pick_seller_title` | فروشنده مورد نظر را انتخاب کنید: | — |
| `admin.group_modify.enter_prefix` | پیشوند یوزرنیم را وارد کنید (مثلاً PRO_): | — |
| `admin.group_modify.enter_user_chat_id` | چت آیدی کاربر را وارد کنید: | — |
| `admin.group_modify.invalid_chat_id` | ❌ چت آیدی نامعتبر است. فقط عدد وارد کنید. | — |
| `admin.group_modify.no_matches` | 🔍 هیچ اکانتی با این فیلتر پیدا نشد. | — |
| `admin.group_modify.preview_title` | 🎯 {selected} از {matched} اکانت انتخاب شده. | selected, matched |
| `admin.group_modify.queue_title` | 🎯 هدف: {count} اکانت | count |
| `admin.group_modify.queue_empty` | — هنوز عملیاتی اضافه نکرده‌اید — | — |
| `admin.group_modify.enter_gb` | چند گیگابایت اضافه شود؟ عدد را وارد کنید: | — |
| `admin.group_modify.enter_days` | چند روز اضافه شود؟ عدد را وارد کنید: | — |
| `admin.group_modify.invalid_number` | ❌ عدد معتبر وارد کنید. | — |
| `admin.group_modify.confirm` | ⚠️ آیا از اعمال {ops_count} تغییر روی {accounts_count} اکانت مطمئن هستید؟ | ops_count, accounts_count |
| `admin.group_modify.applying` | ⏳ در حال اعمال تغییرات... {done} / {total} | done, total |
| `admin.group_modify.report` | 🏁 گزارش نهایی:\n✅ موفق: {ok}\n❌ ناموفق: {fail} | ok, fail |
| `admin.group_modify.report_detail_title` | 📋 جزئیات اکانت‌های ناموفق: | — |

## Backend
- `resolveAccounts(db, selector)` — `src/core/groupModify.ts` resolves the three selector kinds.
- `applyToAccount(db, marzban, account, mods)` — single-account modification (Marzban-as-truth: reads current `data_limit`/`expire` live, then writes delta).
- `executeBatch(db, marzban, accounts, mods, onProgress)` — sequential loop, continue-on-error, optional progress callback.

## Session
Reads + writes only the `groupModify*` namespace in `SessionData` (see `src/bot/context.ts`). All fields are cleared on scene enter and on "back to home".

## Transitions
```
HOME → ADMIN_GROUP_MODIFY (admin only)
ADMIN_GROUP_MODIFY → HOME (back / after report)
```
All other transitions are within the scene — driven by the step machine, not separate scenes.

## Notes
- **Marzban-as-truth:** Every per-account apply re-fetches current `data_limit` and `expire` before computing the delta. The DB `Account.expires_at` is updated only when `addDays` is applied.
- **Mutually exclusive ban/unban:** Status is one slot; the two buttons are paired so tapping one unsets the other.
- **Continue-on-error:** A failing account does not abort the batch. The final report shows per-account success/failure with up to 30 detailed error messages.
- **Progress throttling:** Edits the same message every 5 accounts to avoid Telegram rate limits.
- **No `src/cli/`:** WORKING.md says "cli" but the bot scene is the deliverable; CLAUDE.md keeps `src/cli/` deferred.
- **Single-message UI:** All renders go through `sendOrEdit` (`src/bot/services/renderService.ts`), preserving the bot's single-message convention.
