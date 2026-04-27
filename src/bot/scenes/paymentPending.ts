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
  const txnId = ctx.session.pendingTransactionId;
  if (!txnId) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  const photo = ctx.message.photo;
  const fileId = photo[photo.length - 1].file_id;
  const db = getDb();

  await db.transaction.update({
    where: { id: txnId },
    data: { receipt_file_id: fileId, status: 'awaiting_approval' },
  });

  const txn = await db.transaction.findUnique({
    where: { id: txnId },
    include: { user: true, plan: true },
  });

  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (adminChatId && txn) {
    const planLabel = txn.plan
      ? txn.plan.name
      : formatBytes(Number(txn.data_limit ?? 0));

    await ctx.telegram.sendPhoto(adminChatId, fileId, {
      caption:
        `💳 درخواست پرداخت جدید\n\n` +
        `کاربر: ${txn.user.first_name} (@${txn.user.username ?? 'N/A'})\n` +
        `پلن: ${planLabel}\n` +
        `مبلغ: ${txn.amount} تومان\n` +
        `شناسه: #${String(txn.id)}`,
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ تأیید', `approve_txn_${txn.id}`),
          Markup.button.callback('❌ رد', `reject_txn_${txn.id}`),
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
  const txnId = ctx.session.pendingTransactionId;
  if (txnId) {
    const db = getDb();
    await db.transaction.update({ where: { id: txnId }, data: { status: 'cancelled' } });
  }
  ctx.session.pendingTransactionId = undefined;
  await ctx.scene.enter(SCENE_HOME);
});
