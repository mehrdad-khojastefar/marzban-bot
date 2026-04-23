import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_SUPPORT, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';

export const supportScene = new Scenes.BaseScene<BotContext>(SCENE_SUPPORT);

supportScene.enter(async (ctx) => {
  const supportUsername = process.env.SUPPORT_USERNAME ?? '';
  const msg = await getMessage('support.message', { 'config.support_username': supportUsername });
  await ctx.reply(msg, Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]));
});

supportScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
