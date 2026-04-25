import { Scenes, Markup } from 'telegraf';
import { Prisma } from '@prisma/client';
import { BotContext } from '../context';
import { SCENE_ADMIN_SELLER_ACCOUNTS, SCENE_ADMIN_SELLER_DETAIL } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { formatPrice, formatBytes, toPersianDigits } from '../../core/utils/format';

const PAGE_SIZE = 8;

export const adminSellerAccountsScene = new Scenes.BaseScene<BotContext>(
  SCENE_ADMIN_SELLER_ACCOUNTS,
);

async function renderAccountList(ctx: BotContext) {
  const sellerId = ctx.session.managingSellerId;
  if (!sellerId) {
    await ctx.scene.enter(SCENE_ADMIN_SELLER_DETAIL);
    return;
  }

  const db = getDb();
  const page = ctx.session.currentPage ?? 0;
  const filter = ctx.session.accountFilter ?? 'all';
  const selected = ctx.session.selectedAccountIds ?? [];

  const seller = await db.seller.findUnique({
    where: { id: sellerId },
    include: { user: true },
  });

  const sellerName = seller?.user
    ? [seller.user.first_name, seller.user.last_name].filter(Boolean).join(' ')
    : String(seller?.chat_id ?? '');

  const where: Prisma.AccountWhereInput = { seller_id: sellerId };
  if (filter === 'unpaid') {
    where.payment_status = 'unpaid';
  } else if (filter === 'paid') {
    where.payment_status = 'paid';
  }

  const [accounts, totalCount] = await Promise.all([
    db.account.findMany({
      where,
      include: { seller_plan: true },
      orderBy: { created_at: 'desc' },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.account.count({ where }),
  ]);

  if (totalCount === 0) {
    await sendOrEdit(
      ctx,
      `📊 اکانت‌های فروشنده: ${sellerName}\n\nهنوز اکانتی ساخته نشده.`,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_detail')]]),
    );
    return;
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

  for (const account of accounts) {
    const isPaid = account.payment_status === 'paid';
    const isSelected = selected.includes(account.id);
    const checkbox = isPaid ? '✅' : isSelected ? '☑️' : '☐';
    const planData = account.seller_plan
      ? formatBytes(Number(account.seller_plan.data_limit))
      : '—';
    const price = account.price ? formatPrice(account.price) : '—';
    const statusIcon = isPaid ? '✅' : '⬜';

    const label = `${checkbox} ${account.marzban_username} - ${planData} - ${price} ${statusIcon}`;

    if (isPaid) {
      buttons.push([Markup.button.callback(label, `noop_${account.id}`)]);
    } else {
      buttons.push([Markup.button.callback(label, `toggle_${account.id}`)]);
    }
  }

  // Selection summary
  if (selected.length > 0) {
    const selectedAccounts = await db.account.findMany({
      where: { id: { in: selected } },
      include: { seller_plan: true },
    });
    const selectedTotal = selectedAccounts.reduce(
      (sum, a) => sum + (a.price ?? 0),
      0,
    );

    buttons.push([
      Markup.button.callback(
        `${toPersianDigits(String(selected.length))} انتخاب شده - جمع: ${formatPrice(selectedTotal)}`,
        'noop',
      ),
    ]);
    buttons.push([Markup.button.callback('✅ تسویه انتخاب‌شده‌ها', 'settle_selected')]);
  }

  // Always show "settle all unpaid" if there are unpaid accounts
  const unpaidCount = await db.account.count({
    where: { seller_id: sellerId, payment_status: 'unpaid' },
  });
  if (unpaidCount > 0) {
    buttons.push([
      Markup.button.callback('✅ تسویه همه پرداخت‌نشده‌ها', 'settle_all'),
    ]);
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

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_detail')]);

  await sendOrEdit(
    ctx,
    `📊 اکانت‌های فروشنده: ${sellerName}`,
    Markup.inlineKeyboard(buttons),
  );
}

adminSellerAccountsScene.enter(async (ctx) => {
  ctx.session.currentPage = 0;
  ctx.session.accountFilter = 'all';
  ctx.session.selectedAccountIds = [];
  await renderAccountList(ctx);
});

adminSellerAccountsScene.action(/^toggle_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = parseInt(ctx.match[1]);
  const selected = ctx.session.selectedAccountIds ?? [];

  if (selected.includes(accountId)) {
    ctx.session.selectedAccountIds = selected.filter((id) => id !== accountId);
  } else {
    ctx.session.selectedAccountIds = [...selected, accountId];
  }

  await renderAccountList(ctx);
});

adminSellerAccountsScene.action('settle_selected', async (ctx) => {
  await ctx.answerCbQuery();
  const selected = ctx.session.selectedAccountIds ?? [];
  if (selected.length === 0) return;

  const db = getDb();
  const result = await db.account.updateMany({
    where: { id: { in: selected }, payment_status: 'unpaid' },
    data: { payment_status: 'paid' },
  });

  ctx.session.selectedAccountIds = [];

  const msg = await getMessage('admin.accounts_settled', {
    count: toPersianDigits(String(result.count)),
  });

  // Show settlement confirmation briefly, then re-render list
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_to_list')]]),
  );
});

adminSellerAccountsScene.action('settle_all', async (ctx) => {
  await ctx.answerCbQuery();
  const sellerId = ctx.session.managingSellerId;
  if (!sellerId) return;

  const db = getDb();
  const result = await db.account.updateMany({
    where: { seller_id: sellerId, payment_status: 'unpaid' },
    data: { payment_status: 'paid' },
  });

  ctx.session.selectedAccountIds = [];

  const msg = await getMessage('admin.accounts_settled', {
    count: toPersianDigits(String(result.count)),
  });

  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_to_list')]]),
  );
});

adminSellerAccountsScene.action('back_to_list', async (ctx) => {
  await ctx.answerCbQuery();
  await renderAccountList(ctx);
});

adminSellerAccountsScene.action('filter_all', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.accountFilter = 'all';
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

adminSellerAccountsScene.action('filter_unpaid', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.accountFilter = 'unpaid';
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

adminSellerAccountsScene.action('filter_paid', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.accountFilter = 'paid';
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

adminSellerAccountsScene.action('prev_page', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.currentPage = Math.max(0, (ctx.session.currentPage ?? 0) - 1);
  await renderAccountList(ctx);
});

adminSellerAccountsScene.action('next_page', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.currentPage = (ctx.session.currentPage ?? 0) + 1;
  await renderAccountList(ctx);
});

adminSellerAccountsScene.action(/^noop/, async (ctx) => {
  await ctx.answerCbQuery();
});

adminSellerAccountsScene.action('back_detail', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_ADMIN_SELLER_DETAIL);
});
