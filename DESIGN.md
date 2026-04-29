# Design — User Notification System

## No New Scenes

This feature has no scenes. Notifications are pushed to users by the background scheduler — there is no user-initiated flow, no menu button, no navigation.

The only user interaction is the inline "silence" button on notification messages.

## Notification Message Format

All notifications are sent via `ctx.telegram.sendMessage()` (not `editMessageText` — these are proactive messages, not responses to user actions).

### Speed Prediction Notification
```
⚠️ هشدار مصرف

با سرعت فعلی مصرف، اکانت {display_name} تا {days} روز و {hours} ساعت دیگر به محدودیت حجم می‌رسد.

حجم مصرف‌شده: {used_gb} از {total_gb} گیگابایت

[ 🔇 سکوت ۳ روز ]
```

### Low Data Notification
```
⚠️ حجم رو به اتمام

حجم باقی‌مانده اکانت {display_name}: {remaining_gb} گیگابایت

حجم مصرف‌شده: {used_gb} از {total_gb} گیگابایت

[ 🔇 سکوت ۳ روز ]
```

### Low Time Notification
```
⏳ زمان رو به اتمام

اکانت {display_name} تا {days} روز دیگر منقضی می‌شود.

تاریخ انقضا: {expire_date}

[ 🔇 سکوت ۳ روز ]
```

### Silence Confirmation
After user clicks the silence button, edit the same message to append:
```
✅ اعلان‌های این اکانت برای ۳ روز غیرفعال شد.
```
The silence button is removed (replaced with the confirmation text via `editMessageReplyMarkup` with empty markup).

## Inline Keyboard

Every notification message has exactly one button:

```
callback_data: notif_silence:<account_id>
text: 🔇 سکوت ۳ روز
```

## Multiple Accounts

A user may have multiple active accounts. Each account is evaluated independently. If two accounts both trigger notifications, the user receives two separate messages — one per account. Silence is per-account.

## Multiple Rules on Same Account

If an account triggers both `low_data` and `low_time` in the same scheduler run, the user receives **one combined message** (not two). Rules are merged into a single notification:

```
⚠️ هشدار اکانت {display_name}

حجم باقی‌مانده: {remaining_gb} گیگابایت
زمان باقی‌مانده: {days} روز

حجم مصرف‌شده: {used_gb} از {total_gb} گیگابایت
تاریخ انقضا: {expire_date}

[ 🔇 سکوت ۳ روز ]
```

If only `speed_predict` fires (no other rule), it's sent standalone. If `speed_predict` fires alongside `low_data` or `low_time`, use the combined format (since the prediction is redundant when the user can already see the actual remaining values).

## Data Display Format

- **GB values:** Rounded to 1 decimal place. `2.3 گیگابایت`, `0.8 گیگابایت`
- **Days + hours:** `۳ روز و ۵ ساعت`. If less than 1 day: `۱۲ ساعت`. If less than 1 hour: `کمتر از ۱ ساعت`.
- **Dates:** Jalali (Shamsi) calendar: `۱۴۰۵/۰۲/۰۹` — consistent with the rest of the bot's date display.
- **Persian numerals:** Use Persian digits (۰۱۲۳۴۵۶۷۸۹) for all numbers in notification text.

## Session Data

No session data needed. Notifications are fire-and-forget from the scheduler. The silence callback handler reads `account_id` from callback data and `user.chat_id` from `ctx.from.id` — no session state required.

## Handler Registration

The silence callback handler is registered in `src/bot/handlers/` alongside existing handlers:

```
src/bot/handlers/
  ├── adminPayment.ts
  ├── adminUserApproval.ts
  ├── notificationSilence.ts    ← new
  └── index.ts                  ← re-export
```

Registered in `bot.ts` after other handlers:
```typescript
registerNotificationSilenceHandler(bot)
```

## Scheduler Logging

Each scheduler run logs a one-line summary:
```
notification: checked 42 accounts, sent 5 notifications, skipped 12 (silenced), skipped 25 (no trigger)
```

No per-account logging unless an error occurs (Marzban API failure, Telegram send failure).
