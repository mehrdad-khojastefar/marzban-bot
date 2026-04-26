import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_ADMIN_SELLERS, SCENE_ADMIN_SELLER_DETAIL, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { formatPrice, toEnglishDigits } from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';

export const adminSellersScene = new Scenes.BaseScene<BotContext>(SCENE_ADMIN_SELLERS);

async function renderSellerList(ctx: BotContext) {
  const env = loadEnv();
  if (String(ctx.from!.id) !== env.ADMIN_CHAT_ID) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  const db = getDb();
  const sellers = await db.seller.findMany({
    include: {
      user: true,
      accounts: { include: { seller_plan: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [
    [Markup.button.callback('➕ افزودن فروشنده', 'add_seller')],
  ];

  if (sellers.length === 0) {
    const msg = await getMessage('admin.no_sellers');
    buttons.push([Markup.button.callback('🔙 بازگشت', 'back_home')]);
    await sendOrEdit(ctx, msg, Markup.inlineKeyboard(buttons));
    return;
  }

  const title = await getMessage('admin.sellers_title');

  for (const seller of sellers) {
    const debt = seller.accounts
      .filter((a) => a.payment_status === 'unpaid')
      .reduce((sum, a) => sum + (a.price ?? 0), 0);

    let label: string;
    if (seller.user) {
      const name = [seller.user.first_name, seller.user.last_name].filter(Boolean).join(' ');
      const username = seller.user.username ? ` (@${seller.user.username})` : '';
      label = `${name}${username} - ${formatPrice(debt)}`;
    } else {
      label = `${seller.chat_id} (هنوز شروع نکرده)`;
    }

    const activeIcon = seller.is_active ? '' : ' ❌';
    buttons.push([
      Markup.button.callback(`${label}${activeIcon}`, `seller_${seller.id}`),
    ]);
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_home')]);
  await sendOrEdit(ctx, title, Markup.inlineKeyboard(buttons));
}

adminSellersScene.enter(async (ctx) => {
  await renderSellerList(ctx);
});

adminSellersScene.action('add_seller', async (ctx) => {
  await ctx.answerCbQuery();
  const msg = await getMessage('admin.add_seller_prompt');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );
});

adminSellersScene.on('text', async (ctx) => {
  const input = toEnglishDigits(ctx.message.text.trim());
  const chatId = parseInt(input);

  if (isNaN(chatId) || chatId <= 0) {
    const msg = await getMessage('admin.invalid_chat_id');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
    );
    return;
  }

  const db = getDb();

  const existing = await db.seller.findUnique({ where: { chat_id: BigInt(chatId) } });
  if (existing) {
    const msg = await getMessage('admin.seller_exists');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
    );
    return;
  }

  // Check if user already exists in bot
  const user = await db.user.findUnique({ where: { chat_id: BigInt(chatId) } });

  await db.seller.create({
    data: {
      chat_id: BigInt(chatId),
      user_id: user?.id ?? null,
    },
  });

  let resultMsg = await getMessage('admin.seller_added');

  // Notify seller if they've started the bot
  if (user) {
    try {
      const welcomeMsg = await getMessage('seller.welcome');
      await ctx.telegram.sendMessage(chatId.toString(), welcomeMsg);
      const notifiedMsg = await getMessage('admin.seller_notified');
      resultMsg += '\n' + notifiedMsg;
    } catch {
      // Seller may have blocked the bot
    }
  } else {
    const notStartedMsg = await getMessage('admin.seller_not_started');
    resultMsg += '\n' + notStartedMsg;
  }

  await sendOrEdit(
    ctx,
    resultMsg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );
});

adminSellersScene.action('back_list', async (ctx) => {
  await ctx.answerCbQuery();
  await renderSellerList(ctx);
});

adminSellersScene.action(/^seller_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.managingSellerId = parseInt(ctx.match[1]);
  await ctx.scene.enter(SCENE_ADMIN_SELLER_DETAIL);
});

adminSellersScene.action('back_home', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
