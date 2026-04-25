import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_ERROR, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';

export const errorScene = new Scenes.BaseScene<BotContext>(SCENE_ERROR);

errorScene.enter(async (ctx) => {
  const msg = await getMessage('error.message');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت به منو', 'back')]]),
  );
});

errorScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
