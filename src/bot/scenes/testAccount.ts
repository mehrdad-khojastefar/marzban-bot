import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_TEST_ACCOUNT, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { getDb } from '../../core/db';
import { getMarzban } from '../../core/marzban';

const TEST_DATA_LIMIT = 104857600; // 100MB
const TEST_DURATION_SECONDS = 3600; // 1 hour

export const testAccountScene = new Scenes.BaseScene<BotContext>(SCENE_TEST_ACCOUNT);

testAccountScene.enter(async (ctx) => {
  const db = getDb();
  const user = await db.user.findUnique({ where: { id: ctx.session.userId! } });

  if (!user) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  if (user.has_test) {
    const msg = await getMessage('test.already_used');
    await ctx.reply(msg, Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]));
    return;
  }

  const creatingMsg = await getMessage('test.creating');
  await ctx.reply(creatingMsg);

  try {
    const marzban = getMarzban();
    const chatId = ctx.from!.id;
    const marzbanUsername = `test_${chatId}_${Date.now()}`;

    const marzbanUser = await marzban.addUser({
      username: marzbanUsername,
      data_limit: TEST_DATA_LIMIT,
      expire: Math.floor(Date.now() / 1000) + TEST_DURATION_SECONDS,
      status: 'active',
    });

    await db.account.create({
      data: {
        user_id: user.id,
        marzban_username: marzbanUsername,
        type: 'test',
        expires_at: new Date(Date.now() + TEST_DURATION_SECONDS * 1000),
      },
    });

    await db.user.update({ where: { id: user.id }, data: { has_test: true } });

    const readyMsg = await getMessage('test.ready');
    const configCaption = await getMessage('view.config_caption');

    await ctx.reply(readyMsg + '\n\n⏰ مدت: ۱ ساعت\n📊 حجم: ۱۰۰ مگابایت');

    if (marzbanUser.subscription_url) {
      await ctx.reply(`${configCaption}\n\n${marzbanUser.subscription_url}`);
    } else if (marzbanUser.links && marzbanUser.links.length > 0) {
      await ctx.reply(`${configCaption}\n\n${marzbanUser.links.join('\n')}`);
    }

    await ctx.reply(
      'بازگشت به منو',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
    );
  } catch (err) {
    console.error('Test account provisioning failed:', err);
    const failMsg = await getMessage('test.failed');
    await ctx.reply(failMsg, Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]));
  }
});

testAccountScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
