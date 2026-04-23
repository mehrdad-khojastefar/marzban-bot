# Bot Message System

## Concept
Every user-facing string in the bot is stored in the database. This allows changing bot text without redeployment.

## Table: `bot_messages`

| Column | Type | Description |
|---|---|---|
| `id` | serial | Primary key |
| `key` | varchar(100) | Unique message key (e.g., `home.greeting`) |
| `text` | text | Persian message content. Supports `{variable}` placeholders. |
| `updated_at` | timestamp | Last modification time |

## Key Convention
```
{scene}.{context}
```

Examples:
- `start.welcome_new` — welcome message for new users
- `home.greeting` — home screen greeting
- `buy.select_plan` — plan selection prompt
- `payment.approved` — payment confirmation
- `test.already_used` — test account already claimed

## Variable Placeholders
Messages can contain `{variable}` placeholders that are replaced at runtime:
- `{first_name}` — user's first name
- `{plan.name}` — plan name
- `{plan.price}` — plan price
- `{plan.data_limit}` — plan data limit (formatted)
- `{plan.duration}` — plan duration in days
- `{config.card_number}` — payment card number
- `{config.support_username}` — support Telegram username

## Usage in Code
```typescript
const msg = await getMessages('home.greeting')
// Returns: "از منوی زیر انتخاب کنید:"

const msg = await getMessage('start.welcome_new', { first_name: 'مهرداد' })
// Returns: "سلام مهرداد! به ربات VPN خوش آمدید."
```

## Caching
Messages are cached in memory with a TTL. Cache is invalidated when a message is updated (or on a timer). This avoids a DB query on every bot interaction.

## Seeding
Default messages are seeded from the scene design files on first run. See each `design/bot/scenes/*.md` for the default Persian text.

## Full Message Registry

| Key | Default | Variables |
|---|---|---|
| `start.welcome_new` | سلام {first_name}! به ربات VPN خوش آمدید. | first_name |
| `start.welcome_back` | سلام {first_name}! خوش برگشتید. | first_name |
| `home.greeting` | از منوی زیر انتخاب کنید: | — |
| `buy.select_plan` | پلن مورد نظر خود را انتخاب کنید: | — |
| `buy.payment_instructions` | لطفاً مبلغ زیر را واریز کنید و رسید را ارسال کنید. | — |
| `buy.no_plans` | در حال حاضر پلنی موجود نیست. | — |
| `payment.send_receipt` | لطفاً رسید پرداخت خود را ارسال کنید. | — |
| `payment.waiting` | رسید شما دریافت شد. لطفاً منتظر تأیید بمانید. | — |
| `payment.approved` | ✅ پرداخت شما تأیید شد! اکانت در حال ساخت است... | — |
| `payment.rejected` | ❌ پرداخت شما تأیید نشد. لطفاً دوباره تلاش کنید. | — |
| `payment.cancelled` | انصراف از پرداخت. | — |
| `manage.title` | اکانت‌های شما: | — |
| `manage.no_accounts` | شما هنوز اکانتی ندارید. | — |
| `view.title` | جزئیات اکانت | — |
| `view.config_caption` | کانفیگ اتصال شما: | — |
| `view.expired` | این اکانت منقضی شده است. | — |
| `test.creating` | در حال ساخت اکانت تستی... | — |
| `test.ready` | ✅ اکانت تستی شما آماده است! | — |
| `test.already_used` | شما قبلاً از اکانت تستی استفاده کرده‌اید. | — |
| `test.failed` | خطا در ساخت اکانت تستی. لطفاً دوباره تلاش کنید. | — |
| `support.message` | برای ارتباط با پشتیبانی به آیدی زیر پیام دهید:\n{config.support_username} | config.support_username |
| `error.message` | خطایی رخ داد. لطفاً دوباره تلاش کنید. | — |
