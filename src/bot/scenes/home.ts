import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import {
  SCENE_HOME,
  SCENE_MANAGE_ACCOUNTS,
  SCENE_TEST_ACCOUNT,
  SCENE_BUY_ACCOUNT,
  SCENE_SUPPORT,
} from './constants';
import { getMessage } from '../services/messageService';

export const homeScene = new Scenes.BaseScene<BotContext>(SCENE_HOME);

homeScene.enter(async (ctx) => {
  const msg = await getMessage('home.greeting');
  await ctx.reply(
    msg,
    Markup.inlineKeyboard([
      [Markup.button.callback('مدیریت اکانت‌ها', 'manage_accounts')],
      [
        Markup.button.callback('اکانت تستی', 'test_account'),
        Markup.button.callback('خرید اکانت', 'buy_account'),
      ],
      [Markup.button.callback('پشتیبانی', 'support')],
    ]),
  );
});

homeScene.action('manage_accounts', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
});

homeScene.action('test_account', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_TEST_ACCOUNT);
});

homeScene.action('buy_account', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_BUY_ACCOUNT);
});

homeScene.action('support', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SUPPORT);
});
