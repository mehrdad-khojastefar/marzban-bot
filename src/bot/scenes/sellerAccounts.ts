import { Scenes, Markup } from 'telegraf';
import { Prisma } from '@prisma/client';
import { BotContext } from '../context';
import {
  SCENE_SELLER_ACCOUNTS,
  SCENE_SELLER_PANEL,
  SCENE_SELLER_VIEW_ACCOUNT,
} from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { toPersianDigits } from '../../core/utils/format';

const PAGE_SIZE = 8;

export const sellerAccountsScene = new Scenes.BaseScene<BotContext>(SCENE_SELLER_ACCOUNTS);

async function renderAccountList(ctx: BotContext) {
  const sellerId = ctx.session.sellerId;
  if (!sellerId) {
    await ctx.scene.enter(SCENE_SELLER_PANEL);
    return;
  }

  const db = getDb();
  const page = ctx.session.currentPage ?? 0;
  const search = ctx.session.searchQuery;

  const where: Prisma.AccountWhereInput = { seller_id: sellerId };
  if (search) {
    where.note = { contains: search, mode: 'insensitive' };
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
    if (search) {
      const noResults = await getMessage('seller.search_no_results');
      await sendOrEdit(
        ctx,
        noResults,
        Markup.inlineKeyboard([
          [Markup.button.callback('❌ پاک کردن جستجو', 'clear_search')],
          [Markup.button.callback('🔙 بازگشت', 'back_panel')],
        ]),
      );
    } else {
      const noAccounts = await getMessage('seller.no_accounts');
      await sendOrEdit(
        ctx,
        noAccounts,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_panel')]]),
      );
    }
    return;
  }

  const title = search
    ? `🔍 نتایج جستجو: "${search}" (${toPersianDigits(String(totalCount))} نتیجه)`
    : await getMessage('seller.accounts_title', { count: toPersianDigits(String(totalCount)) });

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

  if (!search) {
    buttons.push([Markup.button.callback('🔍 جستجو', 'search')]);
  }

  for (const account of accounts) {
    const noteDisplay = account.note || 'بدون یادداشت';
    const planName = account.seller_plan?.name ?? '—';
    const statusIcon = account.payment_status === 'paid' ? '✅' : '⬜';
    buttons.push([
      Markup.button.callback(
        `${account.marzban_username} - ${noteDisplay} ${planName} ${statusIcon}`,
        `view_${account.id}`,
      ),
    ]);
  }

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

  if (search) {
    buttons.push([Markup.button.callback('❌ پاک کردن جستجو', 'clear_search')]);
  }
  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_panel')]);

  await sendOrEdit(ctx, title, Markup.inlineKeyboard(buttons));
}

sellerAccountsScene.enter(async (ctx) => {
  ctx.session.currentPage = 0;
  ctx.session.searchQuery = undefined;
  await renderAccountList(ctx);
});

sellerAccountsScene.action(/^view_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.selectedAccountId = parseInt(ctx.match[1]);
  await ctx.scene.enter(SCENE_SELLER_VIEW_ACCOUNT);
});

sellerAccountsScene.action('search', async (ctx) => {
  await ctx.answerCbQuery();
  const msg = await getMessage('seller.search_prompt');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_panel')]]),
  );
});

sellerAccountsScene.on('text', async (ctx) => {
  ctx.session.searchQuery = ctx.message.text.trim();
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

sellerAccountsScene.action('clear_search', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.searchQuery = undefined;
  ctx.session.currentPage = 0;
  await renderAccountList(ctx);
});

sellerAccountsScene.action('prev_page', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.currentPage = Math.max(0, (ctx.session.currentPage ?? 0) - 1);
  await renderAccountList(ctx);
});

sellerAccountsScene.action('next_page', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.currentPage = (ctx.session.currentPage ?? 0) + 1;
  await renderAccountList(ctx);
});

sellerAccountsScene.action('noop', async (ctx) => {
  await ctx.answerCbQuery();
});

sellerAccountsScene.action('back_panel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SELLER_PANEL);
});
