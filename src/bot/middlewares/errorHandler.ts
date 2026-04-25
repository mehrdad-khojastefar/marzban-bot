import { Middleware } from 'telegraf';
import { BotContext } from '../context';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';

export function errorHandler(): Middleware<BotContext> {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      console.error('Bot error:', err);
      try {
        const msg = await getMessage('error.message');
        await sendOrEdit(ctx, msg);
      } catch {
        // Last resort — can't even edit, just try reply
        try {
          await ctx.reply('خطایی رخ داد.');
        } catch {
          // Nothing we can do
        }
      }
    }
  };
}
