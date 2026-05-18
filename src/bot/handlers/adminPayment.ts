import { Telegraf, Markup } from 'telegraf';
import { BotContext } from '../context';
import { getDb } from '../../core/db';
import {
  provisionAccount,
  buildFullAccountNotification,
  renewAccount,
  buildRenewNotification,
  ProvisionConflictError,
} from '../../core/provision';
import { formatBytes } from '../../core/utils/format';
import { getMessage } from '../services/messageService';
import { actorFrom, logEvent } from '../../core/events';

export function registerAdminPaymentHandler(bot: Telegraf<BotContext>): void {
  const adminChatId = process.env.ADMIN_CHAT_ID;

  // ── Approve (Transaction-based) ─────────────────────────────────
  bot.action(/^approve_txn_(\d+)$/, async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery('⏳ در حال ساخت اکانت...');

    const txnId = parseInt(ctx.match[1]);
    const db = getDb();

    const txn = await db.transaction.findUnique({
      where: { id: txnId },
      include: { user: true, plan: true },
    });

    if (!txn || txn.status !== 'awaiting_approval') {
      await ctx.editMessageCaption('⚠️ این تراکنش قبلاً پردازش شده است.');
      return;
    }

    // Determine data limit and duration
    let dataLimit: number;
    let durationDays: number;
    let planLabel: string;

    if (txn.plan) {
      dataLimit = Number(txn.plan.data_limit);
      durationDays = txn.plan.duration_days;
      planLabel = txn.plan.name;
    } else {
      dataLimit = Number(txn.data_limit ?? 0);
      durationDays = txn.duration_days;
      planLabel = formatBytes(dataLimit);
    }

    // Record who approved. The provision functions own all status
    // transitions (claim → provisioning → completed/failed) — we just stamp
    // reviewed_by here.
    await db.transaction.update({
      where: { id: txnId },
      data: { reviewed_by: BigInt(ctx.from!.id) },
    });

    logEvent(
      'payment.admin_approved',
      {
        txnId: txn.id,
        transactionUuid: txn.transaction_id,
        amount: txn.amount,
        targetChatId: txn.user.chat_id,
        type: txn.type,
      },
      actorFrom(ctx.from),
    );

    const retryKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🔄 تلاش مجدد', `approve_txn_${txnId}`),
        Markup.button.callback('❌ رد', `reject_txn_${txnId}`),
      ],
    ]);

    // Route based on transaction type
    if (txn.type === 'renew') {
      if (!txn.account_id) {
        await ctx.editMessageCaption('❌ خطا: اکانت مرتبط با تمدید یافت نشد.');
        return;
      }

      let renewResult;
      try {
        renewResult = await renewAccount(db, {
          transactionId: txnId,
          accountId: txn.account_id,
          dataLimitToAdd: dataLimit,
          durationDays,
        });
      } catch (err) {
        if (err instanceof ProvisionConflictError) {
          await ctx.editMessageCaption('⚠️ این تراکنش قبلاً پردازش شده است.');
          return;
        }
        console.error('Account renewal failed:', err);
        await ctx.editMessageCaption(
          '❌ خطا در تمدید اکانت مرزبان. لطفاً دوباره تلاش کنید.',
          retryKeyboard,
        );
        return;
      }

      try {
        const msg = buildRenewNotification(renewResult);
        await ctx.telegram.sendMessage(txn.user.chat_id.toString(), msg, { parse_mode: 'HTML' });
      } catch (notifyErr) {
        console.error(`Failed to notify user ${txn.user.chat_id}:`, notifyErr);
      }

      await ctx.editMessageCaption(`✅ تأیید شد - اکانت ${renewResult.marzbanUsername} تمدید شد.`);
    } else {
      let result;
      try {
        result = await provisionAccount(db, {
          transactionId: txnId,
          userId: txn.user_id,
          planId: txn.plan_id,
          dataLimit,
          durationDays,
          amount: txn.amount,
        });
      } catch (err) {
        if (err instanceof ProvisionConflictError) {
          await ctx.editMessageCaption('⚠️ این تراکنش قبلاً پردازش شده است.');
          return;
        }
        console.error('Account provisioning failed:', err);
        await ctx.editMessageCaption(
          '❌ خطا در ساخت اکانت مرزبان. لطفاً دوباره تلاش کنید.',
          retryKeyboard,
        );
        return;
      }

      try {
        const msg = await buildFullAccountNotification(result, dataLimit, planLabel);
        await ctx.telegram.sendMessage(txn.user.chat_id.toString(), msg, { parse_mode: 'HTML' });
      } catch (notifyErr) {
        console.error(`Failed to notify user ${txn.user.chat_id}:`, notifyErr);
      }

      await ctx.editMessageCaption(`✅ تأیید شد - اکانت ${result.marzbanUsername} ساخته شد.`);
    }
  });

  // ── Reject (Transaction-based) ──────────────────────────────────
  bot.action(/^reject_txn_(\d+)$/, async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery();

    const txnId = parseInt(ctx.match[1]);
    const db = getDb();

    const txn = await db.transaction.findUnique({
      where: { id: txnId },
      include: { user: true },
    });

    if (!txn || !['awaiting_approval', 'failed'].includes(txn.status)) {
      await ctx.editMessageCaption('⚠️ این تراکنش قبلاً پردازش شده است.');
      return;
    }

    await db.transaction.update({
      where: { id: txnId },
      data: { status: 'rejected', reviewed_by: BigInt(ctx.from!.id) },
    });

    logEvent(
      'payment.admin_rejected',
      {
        txnId: txn.id,
        transactionUuid: txn.transaction_id,
        amount: txn.amount,
        targetChatId: txn.user.chat_id,
        type: txn.type,
      },
      actorFrom(ctx.from),
    );

    const rejectedMsg = await getMessage('payment.rejected');
    await ctx.telegram.sendMessage(txn.user.chat_id.toString(), rejectedMsg);
    await ctx.editMessageCaption('❌ رد شد.');
  });

  // ── Legacy: approve/reject old Payment records ──────────────────
  // Keep for backward compatibility with existing pending payments
  bot.action(/^approve_payment_(\d+)$/, async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery();
    await ctx.editMessageCaption('⚠️ این پرداخت از سیستم قدیمی است. لطفاً از طریق پنل ادمین بررسی کنید.');
  });

  bot.action(/^reject_payment_(\d+)$/, async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery();
    await ctx.editMessageCaption('⚠️ این پرداخت از سیستم قدیمی است. لطفاً از طریق پنل ادمین بررسی کنید.');
  });
}
