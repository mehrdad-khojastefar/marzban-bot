import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_START, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { getDb } from '../../core/db';

export const startScene = new Scenes.BaseScene<BotContext>(SCENE_START);

startScene.enter(async (ctx) => {
  const chatId = BigInt(ctx.from!.id);
  const db = getDb();

  let user = await db.user.findUnique({ where: { chat_id: chatId } });
  let greeting: string;

  if (!user) {
    user = await db.user.create({
      data: {
        chat_id: chatId,
        username: ctx.from!.username ?? null,
        first_name: ctx.from!.first_name,
        last_name: ctx.from!.last_name ?? null,
      },
    });
    greeting = await getMessage('start.welcome_new', { first_name: user.first_name });
  } else {
    await db.user.update({
      where: { id: user.id },
      data: {
        username: ctx.from!.username ?? null,
        first_name: ctx.from!.first_name,
        last_name: ctx.from!.last_name ?? null,
      },
    });
    greeting = await getMessage('start.welcome_back', { first_name: user.first_name });
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

  const sent = await ctx.reply(
    greeting,
    Markup.keyboard([['🏠 منو اصلی']]).resize(),
  );
  ctx.session.lastBotMessageId = sent.message_id;

  await ctx.scene.enter(SCENE_HOME);
});
