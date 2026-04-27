import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_ADMIN_USERS, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { toEnglishDigits } from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';

export const adminUsersScene = new Scenes.BaseScene<BotContext>(SCENE_ADMIN_USERS);

const PAGE_SIZE = 8;

async function renderUserList(ctx: BotContext, page = 0) {
  const env = loadEnv();
  if (String(ctx.from!.id) !== env.ADMIN_CHAT_ID) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  const db = getDb();

  // Reset user creation state
  ctx.session.adminUserStep = undefined;
  ctx.session.pendingUserChatId = undefined;
  ctx.session.managingUserId = undefined;
  ctx.session.currentPage = page;

  const totalUsers = await db.user.count();
  const users = await db.user.findMany({
    include: { bank_card: true },
    orderBy: { created_at: 'desc' },
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [
    [Markup.button.callback('➕ افزودن کاربر', 'add_user')],
  ];

  if (totalUsers === 0) {
    const msg = await getMessage('admin.no_users');
    buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);
    await sendOrEdit(ctx, msg, Markup.inlineKeyboard(buttons));
    return;
  }

  const title = await getMessage('admin.users_title');

  for (const user of users) {
    const name = user.first_name || String(user.chat_id);
    const cardInfo = user.bank_card
      ? ` - 💳 ****${user.bank_card.card_number.slice(-4)}`
      : '';
    buttons.push([Markup.button.callback(`${name}${cardInfo}`, `user_${user.id}`)]);
  }

  // Pagination
  const totalPages = Math.ceil(totalUsers / PAGE_SIZE);
  if (totalPages > 1) {
    const paginationRow: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 0) {
      paginationRow.push(Markup.button.callback('⬅️ قبلی', `page_${page - 1}`));
    }
    paginationRow.push(Markup.button.callback(`${page + 1}/${totalPages}`, 'noop'));
    if (page < totalPages - 1) {
      paginationRow.push(Markup.button.callback('بعدی ➡️', `page_${page + 1}`));
    }
    buttons.push(paginationRow);
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);
  await sendOrEdit(ctx, title, Markup.inlineKeyboard(buttons));
}

adminUsersScene.enter(async (ctx) => {
  await renderUserList(ctx);
});

adminUsersScene.action('noop', async (ctx) => {
  await ctx.answerCbQuery();
});

adminUsersScene.action(/^page_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const page = parseInt(ctx.match[1]);
  await renderUserList(ctx, page);
});

adminUsersScene.action('add_user', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminUserStep = 'chat_id';
  const msg = await getMessage('admin.user_enter_chatid');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );
});

adminUsersScene.on('text', async (ctx) => {
  const step = ctx.session.adminUserStep;

  if (step === 'chat_id') {
    const input = toEnglishDigits(ctx.message.text.trim());

    if (!/^\d+$/.test(input)) {
      const msg = await getMessage('admin.user_enter_chatid');
      await sendOrEdit(
        ctx,
        msg,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
      );
      return;
    }

    const db = getDb();
    const existing = await db.user.findUnique({ where: { chat_id: BigInt(input) } });
    if (existing) {
      const msg = await getMessage('admin.user_exists');
      await sendOrEdit(
        ctx,
        msg,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
      );
      return;
    }

    ctx.session.pendingUserChatId = input;
    ctx.session.adminUserStep = 'select_card';
    await showCardSelection(ctx);
    return;
  }
});

async function showCardSelection(ctx: BotContext, message?: string) {
  const db = getDb();
  const cards = await db.bankCard.findMany({
    where: { is_active: true },
    orderBy: { created_at: 'desc' },
  });

  if (cards.length === 0) {
    const msg = await getMessage('admin.no_active_cards');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
    );
    return;
  }

  const msg = message || (await getMessage('admin.user_select_card'));
  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

  for (const card of cards) {
    const last4 = card.card_number.slice(-4);
    buttons.push([
      Markup.button.callback(
        `💳 ${card.holder_name} - ****${last4}`,
        `select_card_${card.id}`,
      ),
    ]);
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_list')]);
  await sendOrEdit(ctx, msg, Markup.inlineKeyboard(buttons));
}

adminUsersScene.action(/^select_card_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const cardId = parseInt(ctx.match[1]);
  const db = getDb();

  // If we're changing a card for an existing user
  if (ctx.session.managingUserId) {
    await db.user.update({
      where: { id: ctx.session.managingUserId },
      data: { bank_card_id: cardId },
    });
    ctx.session.managingUserId = undefined;
    const msg = await getMessage('admin.user_card_updated');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
    );
    return;
  }

  // Creating a new user
  if (ctx.session.pendingUserChatId) {
    await db.user.create({
      data: {
        chat_id: BigInt(ctx.session.pendingUserChatId),
        first_name: ctx.session.pendingUserChatId,
        bank_card_id: cardId,
      },
    });

    ctx.session.pendingUserChatId = undefined;
    ctx.session.adminUserStep = undefined;

    const msg = await getMessage('admin.user_added');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
    );
    return;
  }
});

adminUsersScene.action(/^user_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = parseInt(ctx.match[1]);
  const db = getDb();
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { bank_card: true },
  });

  if (!user) {
    await renderUserList(ctx);
    return;
  }

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const username = user.username ? ` (@${user.username})` : '';
  const cardInfo = user.bank_card
    ? `💳 ${user.bank_card.holder_name} - ****${user.bank_card.card_number.slice(-4)}`
    : '💳 بدون کارت';

  const detail = [
    `👤 ${name}${username}`,
    `🆔 چت آیدی: ${user.chat_id}`,
    cardInfo,
  ].join('\n');

  await sendOrEdit(
    ctx,
    detail,
    Markup.inlineKeyboard([
      [Markup.button.callback('💳 تغییر کارت', `change_card_${user.id}`)],
      [Markup.button.callback('🔙 بازگشت', 'back_list')],
    ]),
  );
});

adminUsersScene.action(/^change_card_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const userId = parseInt(ctx.match[1]);
  ctx.session.managingUserId = userId;
  await showCardSelection(ctx);
});

adminUsersScene.action('back_list', async (ctx) => {
  await ctx.answerCbQuery();
  await renderUserList(ctx, ctx.session.currentPage ?? 0);
});

adminUsersScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
