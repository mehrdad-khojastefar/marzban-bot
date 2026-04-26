import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_TEST_ACCOUNT, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { getMarzban, buildProxiesAndInbounds } from '../../core/marzban';
import { buildSubUrl, fetchConfigs, extractSubToken } from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';

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
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
    );
    return;
  }

  const creatingMsg = await getMessage('test.creating');
  await sendOrEdit(ctx, creatingMsg);

  try {
    const marzban = getMarzban();
    const chatId = ctx.from!.id;
    const marzbanUsername = `test_${chatId}_${Date.now()}`;

    const { proxies, inbounds } = await buildProxiesAndInbounds();

    const marzbanUser = await marzban.addUser({
      username: marzbanUsername,
      proxies,
      inbounds,
      data_limit: TEST_DATA_LIMIT,
      expire: Math.floor(Date.now() / 1000) + TEST_DURATION_SECONDS,
      status: 'active',
    });

    await db.account.create({
      data: {
        user_id: user.id,
        marzban_username: marzbanUsername,
        marzban_sub_token: extractSubToken(marzbanUser.subscription_url),
        type: 'test',
        expires_at: new Date(Date.now() + TEST_DURATION_SECONDS * 1000),
      },
    });

    await db.user.update({ where: { id: user.id }, data: { has_test: true } });

    const readyMsg = await getMessage('test.ready');
    const env = loadEnv();

    let configText = '';
    const subUrl = buildSubUrl(env.SUB_BASE_URL, marzbanUser.subscription_url);
    configText += `\n\n🔗 لینک اشتراک:\n<pre>${subUrl}</pre>`;
    const configs = await fetchConfigs(subUrl);
    if (configs.length > 0) {
      configText += `\n📋 کانفیگ:\n<pre>${configs.join('\n')}</pre>`;
    }

    await sendOrEdit(
      ctx,
      readyMsg + '\n\n⏰ مدت: ۱ ساعت\n📊 حجم: ۱۰۰ مگابایت' + configText,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
    );
  } catch (err) {
    console.error('Test account provisioning failed:', err);
    const failMsg = await getMessage('test.failed');
    await sendOrEdit(
      ctx,
      failMsg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
    );
  }
});

testAccountScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
