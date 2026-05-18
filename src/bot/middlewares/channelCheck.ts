import { Markup, Middleware } from 'telegraf';
import { BotContext } from '../context';
import { loadEnv } from '../../core/utils/config';
import { actorFrom, logEvent } from '../../core/events';

/**
 * Middleware that enforces channel membership for approved users.
 * - Admin is exempt (always passes through).
 * - Pending/banned users are handled elsewhere (start scene) — skip here.
 * - If CHANNEL_ID is not configured, the check is skipped.
 */
export function channelCheck(): Middleware<BotContext> {
  return async (ctx, next) => {
    const env = loadEnv();

    // No channel configured → skip
    if (!env.CHANNEL_ID) {
      await next();
      return;
    }

    const chatId = ctx.from?.id;
    if (!chatId) {
      await next();
      return;
    }

    // Admin is exempt
    if (String(chatId) === env.ADMIN_CHAT_ID) {
      await next();
      return;
    }

    // Only check approved users (pending/banned are silent-blocked elsewhere).
    // The `attachUser` middleware has already resolved the row once per
    // update and parked it on `ctx.state.user`; we re-use it instead of
    // re-querying.
    const user = ctx.state.user;
    if (!user || user.status !== 'approved') {
      await next();
      return;
    }

    try {
      const member = await ctx.telegram.getChatMember(env.CHANNEL_ID, chatId);
      if (['left', 'kicked'].includes(member.status)) {
        logEvent(
          'user.channel_check_failed',
          { chatId, channelId: env.CHANNEL_ID },
          actorFrom(ctx.from),
        );
        const buttons = env.CHANNEL_INVITE_LINK
          ? Markup.inlineKeyboard([
              [Markup.button.url('📢 عضویت در کانال', env.CHANNEL_INVITE_LINK)],
            ])
          : undefined;
        await ctx.reply(
          '⚠️ برای استفاده از ربات، ابتدا در کانال ما عضو شوید.',
          buttons,
        );
        return; // Block — don't call next()
      }
    } catch (err) {
      console.error('Channel membership check failed:', err);
      // Don't block on API failure — let user through
    }

    await next();
  };
}
