import { Middleware } from 'telegraf';
import { BotContext } from '../context';
import { getMessage } from '../services/messageService';

export function errorHandler(): Middleware<BotContext> {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      console.error('Bot error:', err);
      try {
        const msg = await getMessage('error.message');
        await ctx.reply(msg);
      } catch {
        await ctx.reply('خطایی رخ داد.');
      }
    }
  };
}
