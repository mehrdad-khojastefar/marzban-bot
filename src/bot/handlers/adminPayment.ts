import { Telegraf } from 'telegraf';
import { BotContext } from '../context';
import { getDb } from '../../core/db';
import { getMarzban, buildProxiesAndInbounds } from '../../core/marzban';
import { getMessage } from '../services/messageService';

export function registerAdminPaymentHandler(bot: Telegraf<BotContext>): void {
  const adminChatId = process.env.ADMIN_CHAT_ID;

  bot.action(/^approve_payment_(\d+)$/, async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery();

    const paymentId = parseInt(ctx.match[1]);
    const db = getDb();

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: { user: true, plan: true },
    });

    if (!payment || payment.status !== 'awaiting_approval') {
      await ctx.editMessageCaption('⚠️ این پرداخت قبلاً پردازش شده است.');
      return;
    }

    await db.payment.update({
      where: { id: paymentId },
      data: { status: 'approved', reviewed_by: BigInt(ctx.from!.id) },
    });

    const marzban = getMarzban();
    const marzbanUsername = `paid_${payment.user.chat_id}_${Date.now()}`;
    const expireTimestamp =
      Math.floor(Date.now() / 1000) + payment.plan.duration_days * 24 * 60 * 60;

    const { proxies, inbounds } = await buildProxiesAndInbounds();

    await marzban.addUser({
      username: marzbanUsername,
      proxies,
      inbounds,
      data_limit: Number(payment.plan.data_limit),
      expire: expireTimestamp,
      status: 'active',
    });

    await db.account.create({
      data: {
        user_id: payment.user_id,
        plan_id: payment.plan_id,
        marzban_username: marzbanUsername,
        type: 'paid',
        expires_at: new Date(expireTimestamp * 1000),
      },
    });

    const approvedMsg = await getMessage('payment.approved');
    await ctx.telegram.sendMessage(payment.user.chat_id.toString(), approvedMsg);
    await ctx.editMessageCaption(`✅ تأیید شد - اکانت ${marzbanUsername} ساخته شد.`);
  });

  bot.action(/^reject_payment_(\d+)$/, async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery();

    const paymentId = parseInt(ctx.match[1]);
    const db = getDb();

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: { user: true },
    });

    if (!payment || payment.status !== 'awaiting_approval') {
      await ctx.editMessageCaption('⚠️ این پرداخت قبلاً پردازش شده است.');
      return;
    }

    await db.payment.update({
      where: { id: paymentId },
      data: { status: 'rejected', reviewed_by: BigInt(ctx.from!.id) },
    });

    const rejectedMsg = await getMessage('payment.rejected');
    await ctx.telegram.sendMessage(payment.user.chat_id.toString(), rejectedMsg);
    await ctx.editMessageCaption('❌ رد شد.');
  });
}
