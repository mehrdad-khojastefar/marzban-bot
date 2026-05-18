import { Middleware } from 'telegraf';
import { BotContext } from '../context';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { reportError } from '../../core/utils/errorReporter';

export function errorHandler(): Middleware<BotContext> {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      const userId = ctx.from?.id;
      const scene = ctx.scene?.current?.id ?? 'none';
      const cbData =
        ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
      console.error(`[ERROR] user=${userId} scene=${scene}${cbData ? ` action=${cbData}` : ''}`);
      console.error(err);
      try {
        const msg = await getMessage('error.message');
        await sendOrEdit(ctx, msg);
      } catch (editErr) {
        console.error('[ERROR] Failed to send error message to user:', editErr);
        try {
          await ctx.reply('خطایی رخ داد.');
        } catch {
          // Nothing we can do
        }
      }

      void reportError(err, {
        source: 'bot',
        user_id: userId,
        scene,
        action: cbData,
        update: ctx.updateType,
        chat_id: ctx.chat?.id,
      });
    }
  };
}
