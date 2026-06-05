import type { Middleware } from 'telegraf';
import type { Logger } from 'pino';
import type { BotContext } from '../context';
import { generateRequestId } from '../../core/logger';
import { updateDurationMs } from '../../core/metrics';

/**
 * Middleware: stamp every update with a request id, a child logger pre-bound
 * to that id + the chat id, and a duration histogram observation when the
 * update finishes. Lives behind `errorHandler()` so panics are still caught.
 */
export function observability(rootLogger: Logger): Middleware<BotContext> {
  return async (ctx, next) => {
    const requestId = generateRequestId();
    const chatId = ctx.from?.id;
    const updateType = inferUpdateType(ctx);

    const log = rootLogger.child({
      requestId,
      chatId,
      updateType,
    });

    ctx.state.requestId = requestId;
    ctx.state.log = log;

    const startedAt = process.hrtime.bigint();
    log.debug('update.start');

    try {
      await next();
      const ms = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      updateDurationMs.observe({ update_type: updateType }, ms);
      log.info({ durationMs: ms }, 'update.ok');
    } catch (err) {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      updateDurationMs.observe({ update_type: updateType }, ms);
      log.error({ err, durationMs: ms }, 'update.fail');
      throw err;
    }
  };
}

function inferUpdateType(ctx: BotContext): string {
  if (ctx.updateType) return ctx.updateType;
  if ('callback_query' in ctx.update) return 'callback_query';
  if ('message' in ctx.update) return 'message';
  return 'unknown';
}
