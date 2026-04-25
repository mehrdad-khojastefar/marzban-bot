import { Markup } from 'telegraf';
import { BotContext } from '../context';

type InlineKeyboard = ReturnType<typeof Markup.inlineKeyboard>;

/**
 * Single-message UI helper.
 * Edits the existing bot message if possible, otherwise sends a new one.
 * Tracks the message ID in session so subsequent calls keep editing the same message.
 */
export async function sendOrEdit(
  ctx: BotContext,
  text: string,
  markup?: InlineKeyboard,
): Promise<void> {
  // 1. If triggered by a callback button → edit the message the button lives on
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { ...markup, parse_mode: undefined });
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
        { ...markup, parse_mode: undefined },
      );
      return;
    } catch {
      // Message too old, deleted, or unchanged — fall through
    }
  }

  // 3. Send a new message and track its ID
  const sent = await ctx.reply(text, markup);
  ctx.session.lastBotMessageId = sent.message_id;
}
