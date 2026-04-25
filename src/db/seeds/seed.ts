import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const defaultPlans = [
  { name: '۱ ماهه - ۲۰ گیگ', data_limit: BigInt(20 * 1073741824), duration_days: 30, price: 50000 },
  { name: '۲ ماهه - ۴۰ گیگ', data_limit: BigInt(40 * 1073741824), duration_days: 60, price: 90000 },
  { name: '۳ ماهه - ۶۰ گیگ', data_limit: BigInt(60 * 1073741824), duration_days: 90, price: 120000 },
];

const defaultMessages: { key: string; text: string }[] = [
  // start
  { key: 'start.welcome_new', text: 'سلام {first_name}! به ربات VPN خوش آمدید.' },
  { key: 'start.welcome_back', text: 'سلام {first_name}! خوش برگشتید.' },
  // home
  { key: 'home.greeting', text: 'از منوی زیر انتخاب کنید:' },
  { key: 'buy.disabled', text: 'این بخش فعلاً در دسترس نیست!' },
  // buy
  { key: 'buy.select_plan', text: 'پلن مورد نظر خود را انتخاب کنید:' },
  { key: 'buy.payment_instructions', text: 'لطفاً مبلغ زیر را واریز کنید و رسید را ارسال کنید.' },
  { key: 'buy.no_plans', text: 'در حال حاضر پلنی موجود نیست.' },
  // payment
  { key: 'payment.send_receipt', text: 'لطفاً رسید پرداخت خود را ارسال کنید.' },
  { key: 'payment.waiting', text: 'رسید شما دریافت شد. لطفاً منتظر تأیید بمانید.' },
  { key: 'payment.approved', text: '✅ پرداخت شما تأیید شد! اکانت در حال ساخت است...' },
  { key: 'payment.rejected', text: '❌ پرداخت شما تأیید نشد. لطفاً دوباره تلاش کنید.' },
  { key: 'payment.cancelled', text: 'انصراف از پرداخت.' },
  // manage
  { key: 'manage.title', text: 'اکانت‌های شما:' },
  { key: 'manage.no_accounts', text: 'شما هنوز اکانتی ندارید.' },
  // view
  { key: 'view.title', text: 'جزئیات اکانت' },
  { key: 'view.config_caption', text: 'کانفیگ اتصال شما:' },
  { key: 'view.expired', text: 'این اکانت منقضی شده است.' },
  // test
  { key: 'test.creating', text: 'در حال ساخت اکانت تستی...' },
  { key: 'test.ready', text: '✅ اکانت تستی شما آماده است!' },
  { key: 'test.already_used', text: 'شما قبلاً از اکانت تستی استفاده کرده‌اید.' },
  { key: 'test.failed', text: 'خطا در ساخت اکانت تستی. لطفاً دوباره تلاش کنید.' },
  // support
  { key: 'support.message', text: 'برای ارتباط با پشتیبانی به آیدی زیر پیام دهید:\n{config.support_username}' },
  // error
  { key: 'error.message', text: 'خطایی رخ داد. لطفاً دوباره تلاش کنید.' },
  // seller panel
  { key: 'seller.welcome', text: 'شما به عنوان فروشنده ثبت شده‌اید! از منوی اصلی به پنل فروشنده دسترسی دارید.' },
  { key: 'seller.panel_title', text: '🏪 پنل فروشنده' },
  // seller create account
  { key: 'seller.select_plan', text: 'پلن مورد نظر را انتخاب کنید:' },
  { key: 'seller.no_plans', text: 'هنوز پلنی برای شما تعریف نشده. با ادمین تماس بگیرید.' },
  { key: 'seller.account_created', text: '✅ اکانت ساخته شد!\n\nنام: {name}\nپلن: {plan}\nانقضا: {expire_date}' },
  { key: 'seller.enter_note', text: 'یادداشت بنویسید (یا رد شوید):' },
  { key: 'seller.note_saved', text: 'یادداشت ذخیره شد.' },
  { key: 'seller.create_failed', text: 'خطا در ساخت اکانت. لطفاً دوباره تلاش کنید.' },
  // seller accounts
  { key: 'seller.accounts_title', text: '📋 اکانت‌های شما ({count} اکانت)' },
  { key: 'seller.no_accounts', text: 'هنوز اکانتی نساخته‌اید.' },
  { key: 'seller.search_prompt', text: 'متن جستجو را وارد کنید:' },
  { key: 'seller.search_no_results', text: 'نتیجه‌ای یافت نشد.' },
  // seller view account
  { key: 'seller.account_detail', text: '📊 جزئیات اکانت' },
  { key: 'seller.enter_new_note', text: 'یادداشت جدید را وارد کنید:' },
  // seller report
  { key: 'seller.report', text: '📊 گزارش مالی\n\nکل اکانت‌ها: {total}\nفعال: {active} | منقضی: {expired}\n\n💰 مالی:\nجمع کل: {total_amount}\nپرداخت شده: {paid_amount}\nمانده: {remaining}' },
  // admin sellers
  { key: 'admin.sellers_title', text: '⚙️ مدیریت فروشندگان' },
  { key: 'admin.no_sellers', text: 'هنوز فروشنده‌ای اضافه نشده.' },
  { key: 'admin.add_seller_prompt', text: 'چت آیدی فروشنده جدید را وارد کنید:' },
  { key: 'admin.seller_added', text: '✅ فروشنده اضافه شد.' },
  { key: 'admin.seller_exists', text: 'این کاربر قبلاً فروشنده است.' },
  { key: 'admin.invalid_chat_id', text: 'چت آیدی نامعتبر است. عدد وارد کنید.' },
  { key: 'admin.seller_notified', text: 'فروشنده از ثبت خود مطلع شد.' },
  { key: 'admin.seller_not_started', text: 'فروشنده هنوز ربات را استارت نکرده. پس از استارت مطلع می‌شود.' },
  // admin seller detail
  { key: 'admin.seller_detail', text: '👤 جزئیات فروشنده' },
  { key: 'admin.seller_deactivated', text: 'فروشنده غیرفعال شد.' },
  { key: 'admin.seller_activated', text: 'فروشنده فعال شد.' },
  { key: 'admin.enter_seller_note', text: 'یادداشت را وارد کنید:' },
  { key: 'admin.note_saved', text: 'یادداشت ذخیره شد.' },
  // admin seller plans
  { key: 'admin.plan_name_prompt', text: 'نام پلن را وارد کنید:' },
  { key: 'admin.plan_data_prompt', text: 'حجم را به گیگابایت وارد کنید:' },
  { key: 'admin.plan_price_prompt', text: 'قیمت را به تومان وارد کنید:' },
  { key: 'admin.plan_added', text: '✅ پلن اضافه شد.' },
  // admin seller accounts
  { key: 'admin.accounts_settled', text: '✅ {count} اکانت تسویه شد.' },
];

const defaultSettings: { key: string; value: string }[] = [
  { key: 'buy_enabled', value: 'false' },
];

async function seed() {
  console.log('Seeding plans...');
  for (const plan of defaultPlans) {
    await prisma.plan.upsert({
      where: { id: defaultPlans.indexOf(plan) + 1 },
      update: {},
      create: plan,
    });
  }

  console.log('Seeding bot messages...');
  for (const msg of defaultMessages) {
    await prisma.botMessage.upsert({
      where: { key: msg.key },
      update: {},
      create: msg,
    });
  }

  console.log('Seeding bot settings...');
  for (const setting of defaultSettings) {
    await prisma.botSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log('Seed complete.');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
