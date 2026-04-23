import { Scenes } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_START, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { getDb } from '../../core/db';

export const startScene = new Scenes.BaseScene<BotContext>(SCENE_START);

startScene.enter(async (ctx) => {
  const chatId = BigInt(ctx.from!.id);
  const db = getDb();

  let user = await db.user.findUnique({ where: { chat_id: chatId } });

  if (!user) {
    user = await db.user.create({
      data: {
        chat_id: chatId,
        username: ctx.from!.username ?? null,
        first_name: ctx.from!.first_name,
        last_name: ctx.from!.last_name ?? null,
      },
    });
    const msg = await getMessage('start.welcome_new', { first_name: user.first_name });
    await ctx.reply(msg);
  } else {
    const msg = await getMessage('start.welcome_back', { first_name: user.first_name });
    await ctx.reply(msg);
  }

  ctx.session.userId = user.id;
  await ctx.scene.enter(SCENE_HOME);
});
