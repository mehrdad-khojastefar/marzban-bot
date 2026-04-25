import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import {
  SCENE_SELLER_PANEL,
  SCENE_SELLER_CREATE_ACCOUNT,
  SCENE_SELLER_ACCOUNTS,
  SCENE_SELLER_REPORT,
  SCENE_HOME,
} from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';

export const sellerPanelScene = new Scenes.BaseScene<BotContext>(SCENE_SELLER_PANEL);

sellerPanelScene.enter(async (ctx) => {
  const chatId = BigInt(ctx.from!.id);
  const db = getDb();

  const seller = await db.seller.findUnique({ where: { chat_id: chatId } });
  if (!seller || !seller.is_active) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  ctx.session.sellerId = seller.id;

  const msg = await getMessage('seller.panel_title');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ ساخت اکانت', 'seller_create')],
      [Markup.button.callback('📋 اکانت‌های من', 'seller_accounts')],
      [Markup.button.callback('📊 گزارش مالی', 'seller_report')],
      [Markup.button.callback('🔙 بازگشت', 'back_home')],
    ]),
  );
});

sellerPanelScene.action('seller_create', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SELLER_CREATE_ACCOUNT);
});

sellerPanelScene.action('seller_accounts', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SELLER_ACCOUNTS);
});

sellerPanelScene.action('seller_report', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SELLER_REPORT);
});

sellerPanelScene.action('back_home', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
