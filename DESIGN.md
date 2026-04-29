# Design — Announcements

## Scene Map Addition

```
HOME
  ── admin-only ──
  ├── ... (existing admin buttons)
  └── 📢 اطلاعیه‌ها               → ADMIN_ANNOUNCEMENTS
        ├── ارسال اطلاعیه جدید     → ADMIN_ANNOUNCEMENT_COMPOSE
        │     ├── enter text → preview → confirm target → sending
        │     └── 🔙 بازگشت
        ├── تاریخچه اطلاعیه‌ها     → ADMIN_ANNOUNCEMENT_HISTORY
        │     └── select one      → ADMIN_ANNOUNCEMENT_DETAIL
        └── 🔙 بازگشت
```

## New Scenes

### ADMIN_ANNOUNCEMENTS

Main announcements hub for admin.

**UI:**
```
📢 مدیریت اطلاعیه‌ها

[ ✉️ ارسال اطلاعیه جدید ]
[ 📋 تاریخچه اطلاعیه‌ها ]
[ 🔙 بازگشت ]
```

**Messages:**
| Key | Text |
|---|---|
| `announcement.menu` | `📢 مدیریت اطلاعیه‌ها` |

---

### ADMIN_ANNOUNCEMENT_COMPOSE

Multi-step flow: text → preview → target → confirm → send.

**Step 1 — Enter text:**
```
متن اطلاعیه را وارد کنید:

(HTML مجاز است: <b>بولد</b>، <i>ایتالیک</i>)

[ 🔙 بازگشت ]
```

Admin types the announcement text as a regular message.

**Step 2 — Preview + target:**
```
📋 پیش‌نمایش:
━━━━━━━━━━━━━━━━
{announcement_text}
━━━━━━━━━━━━━━━━

مخاطبین: {target_description}
تعداد: {recipient_count} کاربر

[ 👥 همه کاربران ]
[ 📦 بر اساس پلن‌گروپ ]
[ ✅ ارسال ]
[ 🔙 بازگشت ]
```

- Default target: all approved users
- "بر اساس پلن‌گروپ" shows plan group picker (list of active groups)
- After target is selected, recipient count updates
- "ارسال" sends the broadcast

**Step 3 — Confirmation:**
```
⚠️ اطلاعیه به {recipient_count} کاربر ارسال خواهد شد.

مطمئنید؟

[ ✅ بله، ارسال شود ]
[ ❌ انصراف ]
```

**Step 4 — Sending feedback:**
```
📤 در حال ارسال...

ارسال شده: {delivered}/{total}
ناموفق: {failed}

[ ❌ لغو ارسال ]
```

This message updates periodically (every 50 deliveries or every 5 seconds, whichever comes first) via `editMessageText`.

**Step 5 — Completion:**
```
✅ اطلاعیه ارسال شد.

ارسال شده: {delivered}/{total}
ناموفق: {failed}

[ 🔙 بازگشت ]
```

**Messages:**
| Key | Text |
|---|---|
| `announcement.compose.enter_text` | `متن اطلاعیه را وارد کنید:\n\n(HTML مجاز است: <b>بولد</b>، <i>ایتالیک</i>)` |
| `announcement.compose.preview` | `📋 پیش‌نمایش:\n━━━━━━━━━━━━━━━━\n{text}\n━━━━━━━━━━━━━━━━\n\nمخاطبین: {target}\nتعداد: {count} کاربر` |
| `announcement.compose.confirm` | `⚠️ اطلاعیه به {count} کاربر ارسال خواهد شد.\n\nمطمئنید؟` |
| `announcement.compose.sending` | `📤 در حال ارسال...\n\nارسال شده: {delivered}/{total}\nناموفق: {failed}` |
| `announcement.compose.done` | `✅ اطلاعیه ارسال شد.\n\nارسال شده: {delivered}/{total}\nناموفق: {failed}` |
| `announcement.compose.cancelled` | `❌ ارسال لغو شد.\n\nارسال شده: {delivered}/{total}\nناموفق: {failed}` |
| `announcement.target.all` | `همه کاربران تأیید‌شده` |
| `announcement.target.plan_group` | `پلن‌گروپ: {group_name}` |

---

### ADMIN_ANNOUNCEMENT_HISTORY

Paginated list of past announcements.

**UI:**
```
📋 تاریخچه اطلاعیه‌ها

1. ✅ 1404/02/05 — 150 کاربر — "متن کوتاه..."
2. ✅ 1404/01/28 — 200 کاربر — "متن کوتاه..."
3. 📤 1404/01/20 — 180 کاربر — "متن کوتاه..."

[ ◀️ ] [ ▶️ ]
[ 🔙 بازگشت ]
```

Each row is a callback button leading to ADMIN_ANNOUNCEMENT_DETAIL.

**Messages:**
| Key | Text |
|---|---|
| `announcement.history.title` | `📋 تاریخچه اطلاعیه‌ها` |
| `announcement.history.empty` | `هنوز اطلاعیه‌ای ارسال نشده.` |
| `announcement.history.row` | `{status_icon} {date} — {count} کاربر — "{preview}"` |

---

### ADMIN_ANNOUNCEMENT_DETAIL

Full details of a single announcement.

**UI:**
```
📢 جزئیات اطلاعیه

📅 تاریخ: 1404/02/05
👥 مخاطبین: همه کاربران
✅ ارسال شده: 148/150
❌ ناموفق: 2

━━━━━━━━━━━━━━━━
{full_announcement_text}
━━━━━━━━━━━━━━━━

[ 🔙 بازگشت ]
```

**Messages:**
| Key | Text |
|---|---|
| `announcement.detail` | `📢 جزئیات اطلاعیه\n\n📅 تاریخ: {date}\n👥 مخاطبین: {target}\n✅ ارسال شده: {delivered}/{total}\n❌ ناموفق: {failed}\n\n━━━━━━━━━━━━━━━━\n{text}\n━━━━━━━━━━━━━━━━` |

---

## HOME Scene Change

Add one button to admin section:

```
── admin-only ──
├── ... (existing)
└── 📢 اطلاعیه‌ها    → callback: 'admin_announcements'
```

---

## Session Data Additions

```typescript
// announcement compose flow
announcementText?: string           // text entered by admin
announcementTargetType?: 'all' | 'plan_group'
announcementTargetGroupId?: number  // selected plan group ID
announcementId?: number             // ID of announcement being sent/viewed

// announcement history
announcementPage?: number           // pagination
```

---

## channelCheck Setting Toggle

No new scene needed. Admin can toggle `channel_check_enabled` via the existing BotSettings management (or direct DB update for now). If an admin scene for settings exists later, this setting slots in naturally.

---

## UI Rules (same as rest of bot)
- Single-message UI — `editMessageText` everywhere
- Exception: the broadcast itself sends NEW messages to users (obviously)
- Persian language for all text
- All copy from `bot_messages` table
