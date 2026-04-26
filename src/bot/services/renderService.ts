import { Markup } from 'telegraf';
import { BotContext } from '../context';

type InlineKeyboard = ReturnType<typeof Markup.inlineKeyboard>;

/**
 * Single-message UI helper.
 * Edits the existing bot message if possible, otherwise sends a new one.
 * Tracks the message ID in session so subsequent calls keep editing the same message.
 * Uses Markdown parse mode so triple-backtick code blocks render as copyable text.
 */
export async function sendOrEdit(
  ctx: BotContext,
  text: string,
  markup?: InlineKeyboard,
): Promise<void> {
  const extra = { ...markup, parse_mode: 'HTML' as const };

  // 1. If triggered by a callback button → edit the message the button lives on
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, extra);
      return;
    } catch {
      // Edit failed (message unchanged, deleted, etc.) — fall through
    }
  }

  // 2. Try to edit the last tracked bot message (for text-input flows)
  if (ctx.session.lastBotMessageId && ctx.chat) {
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        ctx.session.lastBotMessageId,
        undefined,
        text,
        extra,
      );
      return;
    } catch {
      // Message too old, deleted, or unchanged — fall through
    }
  }

  // 3. Send a new message and track its ID
  const sent = await ctx.reply(text, extra);
  ctx.session.lastBotMessageId = sent.message_id;
}
