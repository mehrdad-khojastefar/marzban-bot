import { Middleware } from 'telegraf';
import { BotContext } from '../context';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { actorFrom, logEvent } from '../../core/events';

function updateTypeOf(ctx: BotContext): string {
  if (ctx.callbackQuery) return 'callback_query';
  if (ctx.message) return 'message';
  if (ctx.inlineQuery) return 'inline_query';
  return 'other';
}

export function errorHandler(): Middleware<BotContext> {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      const userId = ctx.from?.id;
      const scene = ctx.scene?.current?.id ?? 'none';
      const cbData = ctx.callbackQuery && 'data' in ctx.callbackQuery
        ? ctx.callbackQuery.data
        : undefined;
      console.error(
        `[ERROR] user=${String(userId)} scene=${scene}${cbData ? ` action=${cbData}` : ''}`,
      );
      console.error(err);

      const e = err as Error;
      logEvent(
        'error.handler_caught',
        {
          message: e?.message ?? String(err),
          stack: e?.stack,
          updateType: updateTypeOf(ctx),
          scene,
          callbackData: cbData,
        },
        actorFrom(ctx.from),
      );

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
    }
  };
}
