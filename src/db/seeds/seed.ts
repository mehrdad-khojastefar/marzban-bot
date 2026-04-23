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
  { key: 'start.welcome_new', text: 'سلام {first_name}! به ربات VPN خوش آمدید.' },
  { key: 'start.welcome_back', text: 'سلام {first_name}! خوش برگشتید.' },
  { key: 'home.greeting', text: 'از منوی زیر انتخاب کنید:' },
  { key: 'buy.select_plan', text: 'پلن مورد نظر خود را انتخاب کنید:' },
  { key: 'buy.payment_instructions', text: 'لطفاً مبلغ زیر را واریز کنید و رسید را ارسال کنید.' },
  { key: 'buy.no_plans', text: 'در حال حاضر پلنی موجود نیست.' },
  { key: 'payment.send_receipt', text: 'لطفاً رسید پرداخت خود را ارسال کنید.' },
  { key: 'payment.waiting', text: 'رسید شما دریافت شد. لطفاً منتظر تأیید بمانید.' },
  { key: 'payment.approved', text: '✅ پرداخت شما تأیید شد! اکانت در حال ساخت است...' },
  { key: 'payment.rejected', text: '❌ پرداخت شما تأیید نشد. لطفاً دوباره تلاش کنید.' },
  { key: 'payment.cancelled', text: 'انصراف از پرداخت.' },
  { key: 'manage.title', text: 'اکانت‌های شما:' },
  { key: 'manage.no_accounts', text: 'شما هنوز اکانتی ندارید.' },
  { key: 'view.title', text: 'جزئیات اکانت' },
  { key: 'view.config_caption', text: 'کانفیگ اتصال شما:' },
  { key: 'view.expired', text: 'این اکانت منقضی شده است.' },
  { key: 'test.creating', text: 'در حال ساخت اکانت تستی...' },
  { key: 'test.ready', text: '✅ اکانت تستی شما آماده است!' },
  { key: 'test.already_used', text: 'شما قبلاً از اکانت تستی استفاده کرده‌اید.' },
  { key: 'test.failed', text: 'خطا در ساخت اکانت تستی. لطفاً دوباره تلاش کنید.' },
  { key: 'support.message', text: 'برای ارتباط با پشتیبانی به آیدی زیر پیام دهید:\n{config.support_username}' },
  { key: 'error.message', text: 'خطایی رخ داد. لطفاً دوباره تلاش کنید.' },
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

  console.log('Seed complete.');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
