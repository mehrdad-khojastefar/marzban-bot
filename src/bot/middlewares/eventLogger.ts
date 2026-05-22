import { Middleware } from 'telegraf';
import { BotContext } from '../context';
import { actorFrom, logEvent } from '../../core/events';
import { getDb } from '../../core/db';
import { loadEnv } from '../../core/utils/config';

const HOME_BUTTONS = new Set([
  'manage_accounts',
  'test_account',
  'buy_account',
  'support',
  'seller_panel',
  'admin_sellers',
  'admin_accounts',
  'admin_bank_cards',
  'admin_users',
  'admin_plan_groups',
]);

/**
 * Logs raw user actions:
 *  - /start commands (with deep-link code + resolved status)
 *  - Home-screen top-level button clicks
 *
 * Scene-internal transitions and intermediate editMessageText redraws are
 * NOT logged here — business events emit their own logEvent calls.
 */
export function eventLoggerMiddleware(): Middleware<BotContext> {
  return async (ctx, next) => {
    const actor = actorFrom(ctx.from);

    // /start command
    if (ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/start')) {
      const text = ctx.message.text;
      const code = text.startsWith('/start ') ? text.slice(7).trim() : undefined;

      let status: 'new' | 'pending' | 'approved' | 'banned' | 'admin' = 'new';
      const chatId = ctx.from?.id;
      if (chatId) {
        const env = loadEnv();
        if (String(chatId) === env.ADMIN_CHAT_ID) {
          status = 'admin';
        } else {
          try {
            const db = getDb();
            const user = await db.user.findUnique({ where: { chat_id: BigInt(chatId) } });
            if (user) status = user.status;
          } catch {
            // If DB lookup fails, default to 'new'.
          }
        }
      }
      logEvent('user.start_command', { deepLinkCode: code, status }, actor);
    }

    // Home menu top-level button click
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;
      if (HOME_BUTTONS.has(data)) {
        logEvent('user.home_button_clicked', { button: data }, actor);
      }
    }

    await next();
  };
}
