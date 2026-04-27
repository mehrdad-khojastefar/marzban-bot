import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_PAYMENT_PENDING, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { formatBytes } from '../../core/utils/format';

export const paymentPendingScene = new Scenes.BaseScene<BotContext>(SCENE_PAYMENT_PENDING);

paymentPendingScene.enter(async (ctx) => {
  // Send as a NEW message so the payment instructions (card number) stay visible above
  const msg = await getMessage('payment.send_receipt');
  const sent = await ctx.reply(msg, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'cancel_payment')]]),
  });
  ctx.session.lastBotMessageId = sent.message_id;
});

paymentPendingScene.on('photo', async (ctx) => {
  const paymentId = ctx.session.pendingPaymentId;
  if (!paymentId) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  const photo = ctx.message.photo;
  const fileId = photo[photo.length - 1].file_id;
  const db = getDb();

  await db.payment.update({
    where: { id: paymentId },
    data: { receipt_file_id: fileId, status: 'awaiting_approval' },
  });

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { user: true, plan: true },
  });

  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (adminChatId && payment) {
    const planLabel = payment.plan
      ? payment.plan.name
      : formatBytes(Number(payment.data_limit ?? 0));

    await ctx.telegram.sendPhoto(adminChatId, fileId, {
      caption:
        `💳 درخواست پرداخت جدید\n\n` +
        `کاربر: ${payment.user.first_name} (@${payment.user.username ?? 'N/A'})\n` +
        `پلن: ${planLabel}\n` +
        `مبلغ: ${payment.amount} تومان`,
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ تأیید', `approve_payment_${paymentId}`),
          Markup.button.callback('❌ رد', `reject_payment_${paymentId}`),
        ],
      ]),
    });
  }

  const msg = await getMessage('payment.waiting');
  await sendOrEdit(ctx, msg);
});

paymentPendingScene.on('message', async (ctx) => {
  const msg = await getMessage('payment.send_receipt');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'cancel_payment')]]),
  );
});

paymentPendingScene.action('cancel_payment', async (ctx) => {
  await ctx.answerCbQuery();
  const paymentId = ctx.session.pendingPaymentId;
  if (paymentId) {
    const db = getDb();
    await db.payment.update({ where: { id: paymentId }, data: { status: 'cancelled' } });
  }
  await ctx.scene.enter(SCENE_HOME);
});
