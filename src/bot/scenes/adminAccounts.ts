import { Scenes, Markup } from 'telegraf';
import { Prisma } from '@prisma/client';
import { BotContext } from '../context';
import { SCENE_ADMIN_ACCOUNTS, SCENE_ADMIN_VIEW_ACCOUNT, SCENE_HOME } from './constants';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { formatPrice, formatBytes, toPersianDigits } from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';

const PAGE_SIZE = 8;

export const adminAccountsScene = new Scenes.BaseScene<BotContext>(SCENE_ADMIN_ACCOUNTS);

async function renderAccountList(ctx: BotContext) {
  const env = loadEnv();
  if (String(ctx.from!.id) !== env.ADMIN_CHAT_ID) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  const db = getDb();
  const page = ctx.session.currentPage ?? 0;
  const filter = ctx.session.accountFilter ?? 'all';
  const search = ctx.session.searchQuery;

  const where: Prisma.AccountWhereInput = { seller_id: { not: null } };

  if (filter === 'unpaid') {
    where.payment_status = 'unpaid';
  } else if (filter === 'paid') {
    where.payment_status = 'paid';
  }

  if (search) {
    where.OR = [
      { marzban_username: { contains: search, mode: 'insensitive' } },
      { note: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [accounts, totalCount] = await Promise.all([
    db.account.findMany({
      where,
      include: {
        seller_plan: true,
        seller: { include: { user: true } },
      },
      orderBy: { created_at: 'desc' },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.account.count({ where }),
  ]);

  // Stats
  const [totalAccounts, unpaidCount, unpaidSum] = await Promise.all([
    db.account.count({ where: { seller_id: { not: null } } }),
    db.account.count({ where: { seller_id: { not: null }, payment_status: 'unpaid' } }),
    db.account.findMany({
      where: { seller_id: { not: null }, payment_status: 'unpaid' },
      select: { price: true },
    }),
  ]);
  const totalDebt = unpaidSum.reduce((sum, a) => sum + (a.price ?? 0), 0);

  let header =
    `📋 مدیریت اکانت‌ها\n\n` +
    `کل: ${toPersianDigits(String(totalAccounts))} | ` +
    `پرداخت‌نشده: ${toPersianDigits(String(unpaidCount))} | ` +
    `بدهی: ${formatPrice(totalDebt)}`;

  if (search) {
    header += `\n🔍 جستجو: "${search}" (${toPersianDigits(String(totalCount))} نتیجه)`;
  }

  // Filter buttons
  const filterButtons = [
    Markup.button.callback(filter === 'all' ? '» همه «' : 'همه', 'filter_all'),
    Markup.button.callback(
      filter === 'unpaid' ? '» ⬜ پرداخت‌نشده «' : '⬜ پرداخت‌نشده',
      'filter_unpaid',
    ),
    Markup.button.callback(
      filter === 'paid' ? '» ✅ پرداخت‌شده «' : '✅ پرداخت‌شده',
      'filter_paid',
    ),
  ];

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [filterButtons];

  // Search button
  buttons.push([
    search
      ? Markup.button.callback('❌ پاک کردن جستجو', 'clear_search')
      : Markup.button.callback('🔍 جستجو', 'search'),
  ]);

  if (totalCount === 0) {
    buttons.push([Markup.button.callback('🔙 بازگشت', 'back_home')]);
    await sendOrEdit(ctx, header + '\n\nاکانتی یافت نشد.', Markup.inlineKeyboard(buttons));
    return;
  }

  for (const account of accounts) {
    const isPaid = account.payment_status === 'paid';
    const statusIcon = isPaid ? '✅' : '⬜';
    const price = account.price ? formatPrice(account.price) : '—';
    const sellerName = account.seller?.user
      ? account.seller.user.first_name
      : String(account.seller?.chat_id ?? '?');

    const label = `${statusIcon} ${account.marzban_username} | ${sellerName} | ${price}`;
    buttons.push([Markup.button.callback(label, `view_${account.id}`)]);
  }

  // Pagination
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  if (totalPages > 1) {
    const navButtons: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 0) {
      navButtons.push(Markup.button.callback('◀ قبلی', 'prev_page'));
    }
    navButtons.push(
      Markup.button.callback(
        `صفحه ${toPersianDigits(String(page + 1))} از ${toPersianDigits(String(totalPages))}`,
        'noop',
      ),
    );
    if (page < totalPages - 1) {
      navButtons.push(Markup.button.callback('بعدی ▶', 'next_page'));
    }
    buttons.push(navButtons);
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_home')]);

  await sendOrEdit(ctx, header, Markup.inlineKeyboard(buttons));
}

adminAccountsScene.enter(async (ctx) => {
  ctx.session.currentPage = 0;
  ctx.session.accountFilter = 'all';
  ctx.session.searchQuery = undefined;
  await renderAccountList(ctx);
});

adminAccountsScene.action(/^view_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.selectedAccountId = parseInt(ctx.match[1]);
  ctx.session.adminAccountsFrom = 'global';
  await ctx.scene.enter(SCENE_ADMIN_VIEW_ACCOUNT);
});

adminAccountsScene.action('search', async (ctx) => {
  await ctx.answerCbQuery();
  await sendOrEdit(
    ctx,
    'نام اکانت یا یادداشت را جستجو کنید:',
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );
});

adminAccountsScene.on('text', async (ctx) => {
  ctx.session.searchQuery = ctx.message.text.trim();
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

adminAccountsScene.action('clear_search', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.searchQuery = undefined;
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

adminAccountsScene.action('back_list', async (ctx) => {
  await ctx.answerCbQuery();
  await renderAccountList(ctx);
});

adminAccountsScene.action('filter_all', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.accountFilter = 'all';
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

adminAccountsScene.action('filter_unpaid', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.accountFilter = 'unpaid';
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

adminAccountsScene.action('filter_paid', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.accountFilter = 'paid';
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

adminAccountsScene.action('prev_page', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.currentPage = Math.max(0, (ctx.session.currentPage ?? 0) - 1);
  await renderAccountList(ctx);
});

adminAccountsScene.action('next_page', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.currentPage = (ctx.session.currentPage ?? 0) + 1;
  await renderAccountList(ctx);
});

adminAccountsScene.action('noop', async (ctx) => {
  await ctx.answerCbQuery();
});

adminAccountsScene.action('back_home', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
