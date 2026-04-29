import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_RENEW_ACCOUNT, SCENE_VIEW_ACCOUNT, SCENE_PAYMENT_PENDING } from './constants';
import { getMessage } from '../services/messageService';
import { getSetting } from '../services/settingService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { getMarzban } from '../../core/marzban';
import { formatBytes, formatPrice, formatDaysLeft } from '../../core/utils/format';
import { BankCard, PaymentMethod, PrismaClient } from '@prisma/client';
import { buildCheckoutUrl } from '../../premzy/jwt';

const GB = 1073741824;
const GB_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 100];

async function getPaymentMethod(): Promise<PaymentMethod> {
  const method = await getSetting('payment_method');
  return method === 'premzy' ? 'premzy' : 'manual';
}

async function pickRandomCardForUser(userId: number): Promise<BankCard | null> {
  const db = getDb();
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { bank_cards: { where: { is_active: true } } },
  });
  const cards = user?.bank_cards ?? [];
  if (cards.length === 0) return null;
  return cards[Math.floor(Math.random() * cards.length)];
}

function formatCardNumber(raw: string): string {
  return raw.replace(/(\d{4})/g, '$1-').slice(0, -1);
}

export const renewAccountScene = new Scenes.BaseScene<BotContext>(SCENE_RENEW_ACCOUNT);

renewAccountScene.enter(async (ctx) => {
  const db = getDb();
  const accountId = ctx.session.renewAccountId;

  if (!ctx.session.userId || !accountId) {
    await ctx.scene.enter(SCENE_VIEW_ACCOUNT);
    return;
  }

  // Fetch account + Marzban state for summary
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account || account.user_id !== ctx.session.userId) {
    await ctx.scene.enter(SCENE_VIEW_ACCOUNT);
    return;
  }

  const marzban = getMarzban();
  let accountSummary: string;
  try {
    const marzbanUser = await marzban.getUser(account.marzban_username);
    const used = formatBytes(marzbanUser.used_traffic);
    const limit = marzbanUser.data_limit ? formatBytes(marzbanUser.data_limit) : 'نامحدود';
    const daysLeft = formatDaysLeft(account.expires_at);
    const configName = account.display_name
      ? `${account.display_name}_${account.marzban_username.split('_').pop()}`
      : account.marzban_username;
    accountSummary =
      `📛 نام: ${configName}\n` +
      `📊 مصرف: ${used} / ${limit}\n` +
      `⏰ انقضا: ${daysLeft}`;
  } catch {
    accountSummary = `📛 نام: ${account.marzban_username}`;
  }

  // Fetch user's plan group
  const user = await db.user.findUnique({
    where: { id: ctx.session.userId },
    include: { plan_group: { include: { plans: { where: { is_active: true }, orderBy: { price: 'asc' } } } } },
  });

  if (!user?.plan_group) {
    const msg = await getMessage('renew.no_plans');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
    );
    return;
  }

  const group = user.plan_group;

  if (group.type === 'per_gb') {
    const msg = await getMessage('renew.select_gb');
    const priceInfo = `هر گیگابایت ${formatPrice(group.price_per_gb!)}`;

    const rows: ReturnType<typeof Markup.button.callback>[][] = [];
    for (let i = 0; i < GB_OPTIONS.length; i += 2) {
      const row = GB_OPTIONS.slice(i, i + 2).map((gb) =>
        Markup.button.callback(`${String(gb)} گیگ`, `renew_gb_${gb}`),
      );
      rows.push(row);
    }
    rows.push([Markup.button.callback('🔙 بازگشت', 'back')]);

    await sendOrEdit(ctx, `${accountSummary}\n\n${msg}\n${priceInfo}`, Markup.inlineKeyboard(rows));
  } else {
    const plans = group.plans;
    if (plans.length === 0) {
      const msg = await getMessage('renew.no_plans');
      await sendOrEdit(
        ctx,
        msg,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
      );
      return;
    }

    const msg = await getMessage('renew.select_plan');
    const buttons = plans.map((plan) => [
      Markup.button.callback(
        `🔹 ${plan.name} - ${formatBytes(Number(plan.data_limit))} - ${String(plan.duration_days)} روزه - ${formatPrice(plan.price)}`,
        `renew_plan_${plan.id}`,
      ),
    ]);
    buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);

    await sendOrEdit(ctx, `${accountSummary}\n\n${msg}`, Markup.inlineKeyboard(buttons));
  }
});

// ── Per-GB selection ──────────────────────────────────────────────
renewAccountScene.action(/^renew_gb_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('⏳ در حال پردازش...');
  const gb = parseInt(ctx.match[1]);
  const db = getDb();

  const user = await db.user.findUnique({
    where: { id: ctx.session.userId! },
    include: { plan_group: true },
  });

  if (!user?.plan_group || user.plan_group.type !== 'per_gb') {
    await ctx.scene.enter(SCENE_VIEW_ACCOUNT);
    return;
  }

  const amount = gb * user.plan_group.price_per_gb!;
  const dataLimit = BigInt(gb) * BigInt(GB);
  const durationDays = user.plan_group.duration_days;
  const method = await getPaymentMethod();

  await handleRenewPayment(ctx, {
    userId: user.id,
    accountId: ctx.session.renewAccountId!,
    planId: null,
    dataLimit,
    durationDays,
    amount,
    method,
  });
});

// ── Fixed plan selection ──────────────────────────────────────────
renewAccountScene.action(/^renew_plan_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('⏳ در حال پردازش...');
  const planId = parseInt(ctx.match[1]);
  const db = getDb();
  const plan = await db.plan.findUnique({ where: { id: planId } });

  if (!plan) {
    await ctx.scene.enter(SCENE_RENEW_ACCOUNT);
    return;
  }

  const method = await getPaymentMethod();

  await handleRenewPayment(ctx, {
    userId: ctx.session.userId!,
    accountId: ctx.session.renewAccountId!,
    planId: plan.id,
    dataLimit: plan.data_limit,
    durationDays: plan.duration_days,
    amount: plan.price,
    method,
  });
});

// ── Shared payment handler ────────────────────────────────────────
interface RenewPaymentParams {
  userId: number;
  accountId: number;
  planId: number | null;
  dataLimit: bigint;
  durationDays: number;
  amount: number;
  method: PaymentMethod;
}

async function handleRenewPayment(ctx: BotContext, params: RenewPaymentParams): Promise<void> {
  const db = getDb();

  if (params.method === 'premzy') {
    await handlePremzyRenew(ctx, db, params);
  } else {
    await handleManualRenew(ctx, db, params);
  }
}

async function handlePremzyRenew(
  ctx: BotContext,
  db: PrismaClient,
  params: RenewPaymentParams,
): Promise<void> {
  const txn = await db.transaction.create({
    data: {
      user_id: params.userId,
      plan_id: params.planId,
      data_limit: params.dataLimit,
      duration_days: params.durationDays,
      amount: params.amount,
      type: 'renew',
      method: 'premzy',
      status: 'checkout',
      account_id: params.accountId,
    },
  });

  ctx.session.pendingTransactionId = txn.id;

  let checkoutUrl: string;
  try {
    checkoutUrl = buildCheckoutUrl(params.amount, txn.transaction_id);
  } catch (err) {
    console.error('Failed to build Premzy checkout URL:', err);
    await db.transaction.update({
      where: { id: txn.id },
      data: { status: 'failed', error_message: 'Failed to build checkout URL' },
    });
    await sendOrEdit(ctx, '❌ خطا در ایجاد لینک پرداخت. لطفاً دوباره تلاش کنید.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
    );
    return;
  }

  const dataLabel = formatBytes(Number(params.dataLimit));
  const priceLabel = formatPrice(params.amount);

  const msg =
    `🔄 تمدید اکانت:\n` +
    `📦 حجم اضافه: ${dataLabel}\n` +
    `💰 مبلغ: ${priceLabel}\n\n` +
    `⚠️ <b>قبل از باز کردن لینک، VPN خود را خاموش کنید.</b>\n` +
    `⚠️ مبلغ نهایی ممکن است کمی متفاوت باشد.\n\n` +
    `برای پرداخت روی دکمه زیر کلیک کنید:`;

  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([
      [Markup.button.url('💳 پرداخت', checkoutUrl)],
      [Markup.button.callback('❌ انصراف', 'cancel_renew_checkout')],
    ]),
  );
}

async function handleManualRenew(
  ctx: BotContext,
  db: PrismaClient,
  params: RenewPaymentParams,
): Promise<void> {
  const card = await pickRandomCardForUser(params.userId);
  if (!card) {
    const noCardMsg = await getMessage('renew.no_card');
    await sendOrEdit(
      ctx,
      noCardMsg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
    );
    return;
  }

  const txn = await db.transaction.create({
    data: {
      user_id: params.userId,
      plan_id: params.planId,
      data_limit: params.dataLimit,
      duration_days: params.durationDays,
      amount: params.amount,
      type: 'renew',
      method: 'manual',
      status: 'awaiting_receipt',
      bank_card_id: card.id,
      account_id: params.accountId,
    },
  });

  ctx.session.pendingTransactionId = txn.id;

  const instrMsg = await getMessage('renew.payment_instructions');
  await sendOrEdit(
    ctx,
    `${instrMsg}\n\nمبلغ: ${formatPrice(params.amount)}\nشماره کارت:\n<code>${formatCardNumber(card.card_number)}</code>\nبه نام: ${card.holder_name}\n\nپس از واریز، رسید خود را ارسال کنید.`,
  );

  await ctx.scene.enter(SCENE_PAYMENT_PENDING);
}

// ── Cancel checkout (premzy) ──────────────────────────────────────
renewAccountScene.action('cancel_renew_checkout', async (ctx) => {
  await ctx.answerCbQuery();
  const txnId = ctx.session.pendingTransactionId;
  if (txnId) {
    const db = getDb();
    await db.transaction.update({
      where: { id: txnId },
      data: { status: 'cancelled' },
    });
  }
  ctx.session.pendingTransactionId = undefined;
  await ctx.scene.enter(SCENE_VIEW_ACCOUNT);
});

renewAccountScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_VIEW_ACCOUNT);
});
