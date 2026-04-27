import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import {
  SCENE_START,
  SCENE_HOME,
  SCENE_MANAGE_ACCOUNTS,
  SCENE_TEST_ACCOUNT,
  SCENE_BUY_ACCOUNT,
  SCENE_SUPPORT,
  SCENE_SELLER_PANEL,
  SCENE_ADMIN_SELLERS,
  SCENE_ADMIN_ACCOUNTS,
  SCENE_ADMIN_BANK_CARDS,
  SCENE_ADMIN_USERS,
  SCENE_ADMIN_PLAN_GROUPS,
} from './constants';
import { getMessage } from '../services/messageService';
import { getSetting } from '../services/settingService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { loadEnv } from '../../core/utils/config';

export const homeScene = new Scenes.BaseScene<BotContext>(SCENE_HOME);

homeScene.enter(async (ctx) => {
  const chatId = BigInt(ctx.from!.id);
  const db = getDb();
  const env = loadEnv();

  let msg = await getMessage('home.greeting');

  // Prepend greeting from /start if present
  if (ctx.session.greeting) {
    msg = ctx.session.greeting + '\n\n' + msg;
    ctx.session.greeting = undefined;
  }

  const isAdmin = String(chatId) === env.ADMIN_CHAT_ID;

  // Admin sees only admin panel
  if (isAdmin) {
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([
        [Markup.button.callback('👥 مدیریت فروشندگان', 'admin_sellers')],
        [Markup.button.callback('📋 مدیریت اکانت‌ها', 'admin_accounts')],
        [Markup.button.callback('💳 مدیریت کارت‌ها', 'admin_bank_cards')],
        [Markup.button.callback('👤 مدیریت کاربران', 'admin_users')],
        [Markup.button.callback('📦 مدیریت پلن‌گروپ‌ها', 'admin_plan_groups')],
      ]),
    );
    return;
  }

  // Sellers only see the seller panel button
  const seller = await db.seller.findUnique({ where: { chat_id: chatId } });
  if (seller && seller.is_active) {
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([
        [Markup.button.callback('🏪 پنل فروشنده', 'seller_panel')],
      ]),
    );
    return;
  }

  // Regular users see all buttons
  const buttons: ReturnType<typeof Markup.button.callback>[][] = [
    [Markup.button.callback('مدیریت اکانت‌ها', 'manage_accounts')],
    [
      Markup.button.callback('اکانت تستی', 'test_account'),
      Markup.button.callback('خرید اکانت', 'buy_account'),
    ],
    [Markup.button.callback('پشتیبانی', 'support')],
  ];

  await sendOrEdit(ctx, msg, Markup.inlineKeyboard(buttons));
});

homeScene.action('manage_accounts', async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session.userId) {
    await ctx.scene.enter(SCENE_START);
    return;
  }
  await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
});

homeScene.action('test_account', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_TEST_ACCOUNT);
});

homeScene.action('buy_account', async (ctx) => {
  if (!ctx.session.userId) {
    await ctx.answerCbQuery();
    await ctx.scene.enter(SCENE_START);
    return;
  }
  const buyEnabled = await getSetting('buy_enabled');
  if (buyEnabled !== 'true') {
    const disabledMsg = await getMessage('buy.disabled');
    await ctx.answerCbQuery(disabledMsg, { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_BUY_ACCOUNT);
});

homeScene.action('support', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SUPPORT);
});

homeScene.action('seller_panel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SELLER_PANEL);
});

homeScene.action('admin_sellers', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_ADMIN_SELLERS);
});

homeScene.action('admin_accounts', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_ADMIN_ACCOUNTS);
});

homeScene.action('admin_bank_cards', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_ADMIN_BANK_CARDS);
});

homeScene.action('admin_users', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_ADMIN_USERS);
});

homeScene.action('admin_plan_groups', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_ADMIN_PLAN_GROUPS);
});
