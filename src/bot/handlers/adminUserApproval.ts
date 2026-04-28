import { Telegraf, Markup } from 'telegraf';
import { BotContext } from '../context';
import { getDb } from '../../core/db';
import { getMessage } from '../services/messageService';
import { loadEnv } from '../../core/utils/config';

export function registerAdminUserApprovalHandler(bot: Telegraf<BotContext>): void {
  const adminChatId = process.env.ADMIN_CHAT_ID;

  // ── Approve user (step 1: show card selection) ─────────────────
  bot.action(/^approve_user_(\d+)$/, async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery();

    const userId = parseInt(ctx.match[1]);
    const db = getDb();

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'pending') {
      await ctx.editMessageText('⚠️ این کاربر قبلاً بررسی شده است.');
      return;
    }

    // Show active bank cards for selection (multi-select)
    const cards = await db.bankCard.findMany({ where: { is_active: true } });
    if (cards.length === 0) {
      await ctx.editMessageText(
        '❌ کارت بانکی فعالی وجود ندارد. ابتدا یک کارت اضافه کنید.',
      );
      return;
    }

    const buttons = cards.map((card) => {
      const label = `💳 ${card.card_number.slice(-4)} - ${card.holder_name}`;
      return [Markup.button.callback(label, `toggle_card_${userId}_${card.id}`)];
    });

    buttons.push([Markup.button.callback('✅ تأیید با کارت‌های انتخابی', `confirm_approve_${userId}`)]);
    buttons.push([Markup.button.callback('❌ انصراف', `cancel_approve_${userId}`)]);

    // Store selected cards in message text (stateless approach)
    await ctx.editMessageText(
      `✅ تأیید کاربر: ${user.first_name} (@${user.username ?? '—'})\n\n` +
      `کارت‌های بانکی را انتخاب کنید:\n` +
      `انتخاب شده: هیچکدام`,
      Markup.inlineKeyboard(buttons),
    );
  });

  // ── Toggle card selection ──────────────────────────────────────
  // We track selected cards via the button labels (✅ prefix = selected)
  bot.action(/^toggle_card_(\d+)_(\d+)$/, async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery();

    const userId = parseInt(ctx.match[1]);
    const cardId = parseInt(ctx.match[2]);

    // Parse current message to find which cards are selected
    const msg = ctx.callbackQuery.message;
    if (!msg || !('reply_markup' in msg) || !msg.reply_markup) return;

    const keyboard = msg.reply_markup.inline_keyboard;
    const newKeyboard = keyboard.map((row) => {
      return row.map((btn) => {
        if (!('callback_data' in btn) || !btn.callback_data) return btn;
        if (btn.callback_data === `toggle_card_${userId}_${cardId}`) {
          // Toggle: add/remove ✅ prefix
          const isSelected = btn.text.startsWith('✅ ');
          const newText = isSelected ? btn.text.replace('✅ ', '💳 ') : btn.text.replace('💳 ', '✅ ');
          return Markup.button.callback(newText, btn.callback_data);
        }
        return btn;
      });
    });

    // Count selected cards
    const selectedCount = newKeyboard
      .flat()
      .filter((btn) => 'text' in btn && btn.text.startsWith('✅ ')).length;

    const db = getDb();
    const user = await db.user.findUnique({ where: { id: userId } });
    const headerText =
      `✅ تأیید کاربر: ${user?.first_name ?? '?'} (@${user?.username ?? '—'})\n\n` +
      `کارت‌های بانکی را انتخاب کنید:\n` +
      `انتخاب شده: ${selectedCount > 0 ? String(selectedCount) + ' کارت' : 'هیچکدام'}`;

    try {
      await ctx.editMessageText(headerText, Markup.inlineKeyboard(newKeyboard));
    } catch {
      // Message unchanged
    }
  });

  // ── Confirm approval with selected cards ───────────────────────
  bot.action(/^confirm_approve_(\d+)$/, async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery('⏳ در حال تأیید...');

    const userId = parseInt(ctx.match[1]);
    const db = getDb();

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'pending') {
      await ctx.editMessageText('⚠️ این کاربر قبلاً بررسی شده است.');
      return;
    }

    // Extract selected card IDs from the keyboard buttons
    const msg = ctx.callbackQuery.message;
    if (!msg || !('reply_markup' in msg) || !msg.reply_markup) return;

    const selectedCardIds: number[] = [];
    for (const row of msg.reply_markup.inline_keyboard) {
      for (const btn of row) {
        if (!('callback_data' in btn) || !btn.callback_data) continue;
        const match = btn.callback_data.match(/^toggle_card_\d+_(\d+)$/);
        if (match && btn.text.startsWith('✅ ')) {
          selectedCardIds.push(parseInt(match[1]));
        }
      }
    }

    if (selectedCardIds.length === 0) {
      await ctx.answerCbQuery('❌ حداقل یک کارت باید انتخاب شود.', { show_alert: true });
      return;
    }

    // Approve user and assign cards
    await db.user.update({
      where: { id: userId },
      data: {
        status: 'approved',
        bank_cards: {
          connect: selectedCardIds.map((id) => ({ id })),
        },
      },
    });

    // Notify user with channel invite link
    try {
      const approvedMsg = await getMessage('user.approved');
      const env = loadEnv();
      if (env.CHANNEL_INVITE_LINK) {
        await ctx.telegram.sendMessage(user.chat_id.toString(), approvedMsg, {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.url('📢 عضویت در کانال', env.CHANNEL_INVITE_LINK)],
          ]).reply_markup,
        });
      } else {
        await ctx.telegram.sendMessage(user.chat_id.toString(), approvedMsg);
      }
    } catch (err) {
      console.error(`Failed to notify user ${user.chat_id} of approval:`, err);
    }

    await ctx.editMessageText(
      `✅ کاربر ${user.first_name} (@${user.username ?? '—'}) تأیید شد.\n` +
      `💳 ${String(selectedCardIds.length)} کارت اختصاص داده شد.`,
    );
  });

  // ── Cancel approval ────────────────────────────────────────────
  bot.action(/^cancel_approve_(\d+)$/, async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery();

    const userId = parseInt(ctx.match[1]);
    const db = getDb();
    const user = await db.user.findUnique({ where: { id: userId } });

    // Restore original message with approve/reject buttons
    await ctx.editMessageText(
      `👤 درخواست عضویت\n\n` +
      `📛 نام: ${user?.first_name ?? '?'}\n` +
      `🆔 یوزرنیم: ${user?.username ? '@' + user.username : '—'}\n` +
      `🔢 چت آیدی: ${user?.chat_id.toString() ?? '?'}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ تأیید', `approve_user_${userId}`),
          Markup.button.callback('❌ رد', `reject_user_${userId}`),
        ],
      ]),
    );
  });

  // ── Reject user ────────────────────────────────────────────────
  bot.action(/^reject_user_(\d+)$/, async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery();

    const userId = parseInt(ctx.match[1]);
    const db = getDb();

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.status === 'banned') {
      await ctx.editMessageText('⚠️ این کاربر قبلاً بررسی شده است.');
      return;
    }

    await db.user.update({
      where: { id: userId },
      data: { status: 'banned' },
    });

    // Bot sends NOTHING to banned user — complete silence
    await ctx.editMessageText(
      `❌ کاربر ${user.first_name} (@${user.username ?? '—'}) رد شد و بن شد.`,
    );
  });
}
