import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import crypto from 'node:crypto';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const GB = 1073741824;

const defaultMessages: { key: string; text: string }[] = [
  // start
  { key: 'start.welcome_new', text: 'سلام {first_name}! به ربات VPN خوش آمدید.' },
  { key: 'start.welcome_back', text: 'سلام {first_name}! خوش برگشتید.' },
  { key: 'start.invalid_link', text: '❌ لینک نامعتبر است. لطفاً از لینک صحیح استفاده کنید.' },
  { key: 'user.approved', text: '✅ درخواست شما تأیید شد! از منوی اصلی استفاده کنید.' },
  { key: 'user.join_channel', text: '⚠️ برای استفاده از ربات، ابتدا در کانال ما عضو شوید.' },
  // home
  { key: 'home.greeting', text: 'از منوی زیر انتخاب کنید:' },
  { key: 'buy.disabled', text: 'این بخش فعلاً در دسترس نیست!' },
  // buy
  { key: 'buy.select_plan', text: 'پلن مورد نظر خود را انتخاب کنید:' },
  { key: 'buy.select_gb', text: 'حجم مورد نظر خود را انتخاب کنید:' },
  { key: 'buy.payment_instructions', text: 'لطفاً مبلغ زیر را واریز کنید و رسید را ارسال کنید.' },
  { key: 'buy.no_plans', text: 'در حال حاضر پلنی موجود نیست.' },
  { key: 'buy.no_card', text: '❌ کارت بانکی برای شما تعیین نشده. لطفاً با پشتیبانی تماس بگیرید.' },
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
  // admin bank cards
  { key: 'admin.cards_title', text: '💳 مدیریت کارت‌های بانکی' },
  { key: 'admin.card_enter_number', text: 'شماره کارت ۱۶ رقمی را وارد کنید:' },
  { key: 'admin.card_enter_holder', text: 'نام صاحب کارت را وارد کنید:' },
  { key: 'admin.card_enter_bank', text: 'نام بانک را وارد کنید (اختیاری):' },
  { key: 'admin.card_added', text: '✅ کارت بانکی با موفقیت اضافه شد.' },
  { key: 'admin.card_deleted', text: '✅ کارت بانکی حذف شد.' },
  { key: 'admin.card_has_users', text: '❌ این کارت به کاربرانی اختصاص دارد و قابل حذف نیست.' },
  { key: 'admin.card_invalid_number', text: '❌ شماره کارت نامعتبر است. لطفاً ۱۶ رقم وارد کنید.' },
  { key: 'admin.no_cards', text: 'هنوز کارت بانکی اضافه نشده.' },
  // admin users
  { key: 'admin.users_title', text: '👤 مدیریت کاربران' },
  { key: 'admin.user_enter_chatid', text: 'چت آیدی تلگرام کاربر را وارد کنید:' },
  { key: 'admin.user_select_card', text: 'کارت بانکی مورد نظر برای این کاربر را انتخاب کنید:' },
  { key: 'admin.user_added', text: '✅ کاربر با موفقیت اضافه شد.' },
  { key: 'admin.user_exists', text: '❌ کاربری با این چت آیدی قبلاً ثبت شده.' },
  { key: 'admin.user_card_updated', text: '✅ کارت بانکی کاربر تغییر کرد.' },
  { key: 'admin.no_active_cards', text: '❌ کارت بانکی فعالی وجود ندارد. ابتدا یک کارت اضافه کنید.' },
  { key: 'admin.no_users', text: 'هنوز کاربری اضافه نشده.' },
];

const defaultSettings: { key: string; value: string }[] = [
  { key: 'buy_enabled', value: 'false' },
  { key: 'payment_method', value: 'manual' }, // 'manual' or 'premzy'
  { key: 'test_enabled', value: 'false' },
];

function generateCode(): string {
  return crypto.randomUUID().split('-')[0];
}

async function seed() {
  console.log('Seeding plan groups...');

  // Only create if no per_gb group exists yet
  let perGbGroup = await prisma.planGroup.findFirst({ where: { type: 'per_gb' } });
  if (!perGbGroup) {
    perGbGroup = await prisma.planGroup.create({
      data: {
        code: generateCode(),
        name: 'هر گیگ ۳۰۰ تومان',
        type: 'per_gb',
        price_per_gb: 300000,
        duration_days: 30,
      },
    });
    console.log(`  Created per-GB group: code=${perGbGroup.code}`);
  } else {
    console.log(`  Per-GB group already exists: code=${perGbGroup.code}`);
  }

  let fixedGroup = await prisma.planGroup.findFirst({ where: { type: 'fixed' } });
  if (!fixedGroup) {
    fixedGroup = await prisma.planGroup.create({
      data: {
        code: generateCode(),
        name: 'بسته‌های ثابت',
        type: 'fixed',
        duration_days: 30,
      },
    });
    console.log(`  Created fixed group: code=${fixedGroup.code}`);
  } else {
    console.log(`  Fixed group already exists: code=${fixedGroup.code}`);
  }

  console.log('Seeding fixed plans...');
  const existingPlans = await prisma.plan.count({ where: { group_id: fixedGroup.id } });
  if (existingPlans === 0) {
    await prisma.plan.createMany({
      data: [
        { name: '۵ گیگ', data_limit: BigInt(5 * GB), duration_days: 30, price: 600000, group_id: fixedGroup.id },
        { name: '۱۰ گیگ', data_limit: BigInt(10 * GB), duration_days: 30, price: 1100000, group_id: fixedGroup.id },
      ],
    });
    console.log('  Created fixed plans.');
  } else {
    console.log('  Fixed plans already exist.');
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
  console.log(`\nDeep links:`);
  console.log(`  Per-GB: t.me/doveng_bot?start=${perGbGroup.code}`);
  console.log(`  Fixed:  t.me/doveng_bot?start=${fixedGroup.code}`);
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
