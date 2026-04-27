import { Telegraf, Markup } from 'telegraf';
import { BotContext } from '../context';
import { getDb } from '../../core/db';
import { getMarzban, buildProxiesAndInbounds } from '../../core/marzban';
import { extractSubToken, buildSubUrl, fetchAndRenameConfigs, formatBytes, formatDaysLeft } from '../../core/utils/format';
import { getMessage } from '../services/messageService';
import { loadEnv } from '../../core/utils/config';

function generateUsername(): string {
  const rand = Math.floor(100000 + Math.random() * 900000); // 6-digit random
  return `dove_${rand}`;
}

export function registerAdminPaymentHandler(bot: Telegraf<BotContext>): void {
  const adminChatId = process.env.ADMIN_CHAT_ID;

  bot.action(/^approve_payment_(\d+)$/, async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery('⏳ در حال ساخت اکانت...');

    const paymentId = parseInt(ctx.match[1]);
    const db = getDb();

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: { user: { include: { plan_group: true } }, plan: true },
    });

    if (!payment || payment.status !== 'awaiting_approval') {
      await ctx.editMessageCaption('⚠️ این پرداخت قبلاً پردازش شده است.');
      return;
    }

    // Determine data_limit and duration based on plan (fixed) or per_gb payment
    let dataLimit: number;
    let durationDays: number;

    if (payment.plan) {
      dataLimit = Number(payment.plan.data_limit);
      durationDays = payment.plan.duration_days;
    } else {
      dataLimit = Number(payment.data_limit ?? 0);
      durationDays = payment.user.plan_group?.duration_days ?? 30;
    }

    const expireTimestamp =
      Math.floor(Date.now() / 1000) + durationDays * 24 * 60 * 60;

    // Create Marzban account FIRST — only mark as approved after success
    let marzbanUsername: string;
    let subToken: string;
    try {
      const marzban = getMarzban();
      marzbanUsername = generateUsername();
      const { proxies, inbounds } = await buildProxiesAndInbounds();

      const marzbanUser = await marzban.addUser({
        username: marzbanUsername,
        proxies,
        inbounds,
        data_limit: dataLimit,
        expire: expireTimestamp,
        status: 'active',
      });

      subToken = extractSubToken(marzbanUser.subscription_url);
    } catch (err) {
      console.error('Marzban account creation failed:', err);
      await ctx.editMessageCaption(
        '❌ خطا در ساخت اکانت مرزبان. لطفاً دوباره تلاش کنید.',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('🔄 تلاش مجدد', `approve_payment_${paymentId}`),
            Markup.button.callback('❌ رد', `reject_payment_${paymentId}`),
          ],
        ]),
      );
      return;
    }

    // Marzban succeeded — now mark as approved and save account
    await db.payment.update({
      where: { id: paymentId },
      data: { status: 'approved', reviewed_by: BigInt(ctx.from!.id) },
    });

    await db.account.create({
      data: {
        user_id: payment.user_id,
        plan_id: payment.plan_id,
        marzban_username: marzbanUsername,
        marzban_sub_token: subToken,
        type: 'paid',
        payment_status: 'paid',
        price: payment.amount,
        expires_at: new Date(expireTimestamp * 1000),
      },
    });

    // Notify user with account details
    const env = loadEnv();
    const planLabel = payment.plan
      ? payment.plan.name
      : `${String(dataLimit / 1073741824)} گیگ`;
    const expiresAt = new Date(expireTimestamp * 1000);

    let userMsg =
      `✅ اکانت شما ساخته شد!\n\n` +
      `📛 نام: ${marzbanUsername}\n` +
      `📦 حجم: ${formatBytes(dataLimit)}\n` +
      `⏰ انقضا: ${formatDaysLeft(expiresAt)}\n` +
      `📋 پلن: ${planLabel}`;

    if (subToken) {
      const subUrl = buildSubUrl(env.SUB_BASE_URL, `/sub/${subToken}`);
      const linkPrefix = env.CONFIG_LINK_PREFIX;
      const configs = await fetchAndRenameConfigs(
        env.MARZBAN_SUB_URL,
        subToken,
        linkPrefix,
        marzbanUsername,
      );
      userMsg += `\n\n🔗 لینک اشتراک:\n<pre>${subUrl}</pre>`;
      if (configs.length > 0) {
        userMsg += `\n📋 کانفیگ‌ها:`;
        for (const config of configs) {
          userMsg += `\n<pre>${config}</pre>`;
        }
      }
    }

    await ctx.telegram.sendMessage(payment.user.chat_id.toString(), userMsg, {
      parse_mode: 'HTML',
    });
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
