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
- `seller.panel_title` — seller panel heading
- `admin.sellers_title` — admin seller list heading

## Variable Placeholders
Messages can contain `{variable}` placeholders that are replaced at runtime:
- `{first_name}` — user's first name
- `{plan.name}` — plan name
- `{plan.price}` — plan price
- `{plan.data_limit}` — plan data limit (formatted)
- `{plan.duration}` — plan duration in days
- `{config.card_number}` — payment card number
- `{config.support_username}` — support Telegram username
- `{name}` — Marzban account username
- `{expire_date}` — account expiry date (Jalali)
- `{count}` — numeric count
- `{seller_name}` — seller's display name
- `{total}` — total amount
- `{active}` — active account count
- `{expired}` — expired account count
- `{total_amount}` — total financial amount
- `{paid_amount}` — paid amount
- `{remaining}` — remaining/outstanding amount

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

### Start Scene
| Key | Default | Variables |
|---|---|---|
| `start.welcome_new` | سلام {first_name}! به ربات VPN خوش آمدید. | first_name |
| `start.welcome_back` | سلام {first_name}! خوش برگشتید. | first_name |

### Home Scene
| Key | Default | Variables |
|---|---|---|
| `home.greeting` | از منوی زیر انتخاب کنید: | — |
| `buy.disabled` | این بخش فعلاً در دسترس نیست! | — |

### Buy Account Scene
| Key | Default | Variables |
|---|---|---|
| `buy.select_plan` | پلن مورد نظر خود را انتخاب کنید: | — |
| `buy.payment_instructions` | لطفاً مبلغ زیر را واریز کنید و رسید را ارسال کنید. | — |
| `buy.no_plans` | در حال حاضر پلنی موجود نیست. | — |

### Payment Scene
| Key | Default | Variables |
|---|---|---|
| `payment.send_receipt` | لطفاً رسید پرداخت خود را ارسال کنید. | — |
| `payment.waiting` | رسید شما دریافت شد. لطفاً منتظر تأیید بمانید. | — |
| `payment.approved` | ✅ پرداخت شما تأیید شد! اکانت در حال ساخت است... | — |
| `payment.rejected` | ❌ پرداخت شما تأیید نشد. لطفاً دوباره تلاش کنید. | — |
| `payment.cancelled` | انصراف از پرداخت. | — |

### Manage Accounts Scene
| Key | Default | Variables |
|---|---|---|
| `manage.title` | اکانت‌های شما: | — |
| `manage.no_accounts` | شما هنوز اکانتی ندارید. | — |

### View Account Scene
| Key | Default | Variables |
|---|---|---|
| `view.title` | جزئیات اکانت | — |
| `view.config_caption` | کانفیگ اتصال شما: | — |
| `view.expired` | این اکانت منقضی شده است. | — |

### Test Account Scene
| Key | Default | Variables |
|---|---|---|
| `test.creating` | در حال ساخت اکانت تستی... | — |
| `test.ready` | ✅ اکانت تستی شما آماده است! | — |
| `test.already_used` | شما قبلاً از اکانت تستی استفاده کرده‌اید. | — |
| `test.failed` | خطا در ساخت اکانت تستی. لطفاً دوباره تلاش کنید. | — |

### Support Scene
| Key | Default | Variables |
|---|---|---|
| `support.message` | برای ارتباط با پشتیبانی به آیدی زیر پیام دهید:\n{config.support_username} | config.support_username |

### Error Scene
| Key | Default | Variables |
|---|---|---|
| `error.message` | خطایی رخ داد. لطفاً دوباره تلاش کنید. | — |

### Seller Panel Scene
| Key | Default | Variables |
|---|---|---|
| `seller.welcome` | شما به عنوان فروشنده ثبت شده‌اید! از منوی اصلی به پنل فروشنده دسترسی دارید. | — |
| `seller.panel_title` | 🏪 پنل فروشنده | — |

### Seller Create Account Scene
| Key | Default | Variables |
|---|---|---|
| `seller.select_plan` | پلن مورد نظر را انتخاب کنید: | — |
| `seller.no_plans` | هنوز پلنی برای شما تعریف نشده. با ادمین تماس بگیرید. | — |
| `seller.account_created` | ✅ اکانت ساخته شد!\n\nنام: {name}\nپلن: {plan}\nانقضا: {expire_date} | name, plan, expire_date |
| `seller.enter_note` | یادداشت بنویسید (یا رد شوید): | — |
| `seller.note_saved` | یادداشت ذخیره شد. | — |
| `seller.create_failed` | خطا در ساخت اکانت. لطفاً دوباره تلاش کنید. | — |

### Seller Accounts Scene
| Key | Default | Variables |
|---|---|---|
| `seller.accounts_title` | 📋 اکانت‌های شما ({count} اکانت) | count |
| `seller.no_accounts` | هنوز اکانتی نساخته‌اید. | — |
| `seller.search_prompt` | متن جستجو را وارد کنید: | — |
| `seller.search_no_results` | نتیجه‌ای یافت نشد. | — |

### Seller View Account Scene
| Key | Default | Variables |
|---|---|---|
| `seller.account_detail` | 📊 جزئیات اکانت | — |
| `seller.enter_new_note` | یادداشت جدید را وارد کنید: | — |

### Seller Report Scene
| Key | Default | Variables |
|---|---|---|
| `seller.report` | 📊 گزارش مالی\n\nکل اکانت‌ها: {total}\nفعال: {active} \| منقضی: {expired}\n\n💰 مالی:\nجمع کل: {total_amount}\nپرداخت شده: {paid_amount}\nمانده: {remaining} | total, active, expired, total_amount, paid_amount, remaining |

### Admin Sellers Scene
| Key | Default | Variables |
|---|---|---|
| `admin.sellers_title` | ⚙️ مدیریت فروشندگان | — |
| `admin.no_sellers` | هنوز فروشنده‌ای اضافه نشده. | — |
| `admin.add_seller_prompt` | چت آیدی فروشنده جدید را وارد کنید: | — |
| `admin.seller_added` | ✅ فروشنده اضافه شد. | — |
| `admin.seller_exists` | این کاربر قبلاً فروشنده است. | — |
| `admin.invalid_chat_id` | چت آیدی نامعتبر است. عدد وارد کنید. | — |
| `admin.seller_notified` | فروشنده از ثبت خود مطلع شد. | — |
| `admin.seller_not_started` | فروشنده هنوز ربات را استارت نکرده. پس از استارت مطلع می‌شود. | — |

### Admin Seller Detail Scene
| Key | Default | Variables |
|---|---|---|
| `admin.seller_detail` | 👤 جزئیات فروشنده | — |
| `admin.seller_deactivated` | فروشنده غیرفعال شد. | — |
| `admin.seller_activated` | فروشنده فعال شد. | — |
| `admin.enter_seller_note` | یادداشت را وارد کنید: | — |
| `admin.note_saved` | یادداشت ذخیره شد. | — |

### Admin Seller Plans Scene
| Key | Default | Variables |
|---|---|---|
| `admin.plan_name_prompt` | نام پلن را وارد کنید: | — |
| `admin.plan_data_prompt` | حجم را به گیگابایت وارد کنید: | — |
| `admin.plan_price_prompt` | قیمت را به تومان وارد کنید: | — |
| `admin.plan_added` | ✅ پلن اضافه شد. | — |

### Admin Seller Accounts Scene
| Key | Default | Variables |
|---|---|---|
| `admin.accounts_settled` | ✅ {count} اکانت تسویه شد. | count |
