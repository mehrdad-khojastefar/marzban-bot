import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_START, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { getDb } from '../../core/db';
import { loadEnv } from '../../core/utils/config';

export const startScene = new Scenes.BaseScene<BotContext>(SCENE_START);

startScene.enter(async (ctx) => {
  const chatId = BigInt(ctx.from!.id);
  const db = getDb();
  const env = loadEnv();

  // Admin always gets through — no user record needed
  const isAdmin = String(chatId) === env.ADMIN_CHAT_ID;
  if (isAdmin) {
    const sent = await ctx.reply('⏳', Markup.keyboard([['🏠 منو اصلی']]).resize());
    ctx.session.lastBotMessageId = sent.message_id;
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  let user = await db.user.findUnique({ where: { chat_id: chatId } });
  let greeting: string;

  if (user) {
    // Returning user — update profile, go to HOME
    await db.user.update({
      where: { id: user.id },
      data: {
        username: ctx.from!.username ?? null,
        first_name: ctx.from!.first_name,
        last_name: ctx.from!.last_name ?? null,
      },
    });
    greeting = await getMessage('start.welcome_back', { first_name: user.first_name });
  } else {
    // New user — need a valid deep link code
    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const code = messageText.startsWith('/start ')
      ? messageText.slice(7).trim()
      : undefined;
    if (!code) {
      const errorMsg = await getMessage('start.invalid_link');
      await ctx.reply(errorMsg);
      return;
    }

    const planGroup = await db.planGroup.findFirst({
      where: { code, is_active: true },
    });
    if (!planGroup) {
      const errorMsg = await getMessage('start.invalid_link');
      await ctx.reply(errorMsg);
      return;
    }

    user = await db.user.create({
      data: {
        chat_id: chatId,
        username: ctx.from!.username ?? null,
        first_name: ctx.from!.first_name,
        last_name: ctx.from!.last_name ?? null,
        plan_group_id: planGroup.id,
      },
    });

    greeting = await getMessage('start.welcome_new', { first_name: user.first_name });
  }

  ctx.session.userId = user.id;

  // Check if this user is a seller that hasn't been linked yet
  const seller = await db.seller.findUnique({ where: { chat_id: chatId } });
  if (seller && !seller.user_id) {
    await db.seller.update({
      where: { id: seller.id },
      data: { user_id: user.id },
    });
    const welcomeMsg = await getMessage('seller.welcome');
    greeting += '\n\n' + welcomeMsg;
  }

  // Set persistent reply keyboard
  const sent = await ctx.reply('⏳', Markup.keyboard([['🏠 منو اصلی']]).resize());
  ctx.session.lastBotMessageId = sent.message_id;
  ctx.session.greeting = greeting;

  await ctx.scene.enter(SCENE_HOME);
});
