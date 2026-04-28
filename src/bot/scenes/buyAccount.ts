import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_BUY_ACCOUNT, SCENE_HOME, SCENE_PAYMENT_PENDING } from './constants';
import { getMessage } from '../services/messageService';
import { getSetting } from '../services/settingService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { formatBytes, formatPrice } from '../../core/utils/format';
import { BankCard, PaymentMethod, PrismaClient } from '@prisma/client';
import { buildCheckoutUrl } from '../../premzy/jwt';

const GB = 1073741824;
const GB_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 100];

async function getPaymentMethod(): Promise<PaymentMethod> {
  const method = await getSetting('payment_method');
  return method === 'premzy' ? 'premzy' : 'manual';
}

/** Pick a random card from the user's assigned cards (active only). */
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

export const buyAccountScene = new Scenes.BaseScene<BotContext>(SCENE_BUY_ACCOUNT);

buyAccountScene.enter(async (ctx) => {
  const db = getDb();

  if (!ctx.session.userId) {
    console.error('buyAccount.enter: no userId in session');
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  const user = await db.user.findUnique({
    where: { id: ctx.session.userId },
    include: { plan_group: { include: { plans: { where: { is_active: true }, orderBy: { price: 'asc' } } } } },
  });

  if (!user?.plan_group) {
    const msg = await getMessage('buy.no_plans');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
    );
    return;
  }

  const group = user.plan_group;

  if (group.type === 'per_gb') {
    const msg = await getMessage('buy.select_gb');
    const priceInfo = `هر گیگابایت ${formatPrice(group.price_per_gb!)}`;

    const rows: ReturnType<typeof Markup.button.callback>[][] = [];
    for (let i = 0; i < GB_OPTIONS.length; i += 2) {
      const row = GB_OPTIONS.slice(i, i + 2).map((gb) =>
        Markup.button.callback(`${String(gb)} گیگ`, `select_gb_${gb}`),
      );
      rows.push(row);
    }
    rows.push([Markup.button.callback('🔙 بازگشت', 'back')]);

    await sendOrEdit(ctx, `${msg}\n\n${priceInfo}`, Markup.inlineKeyboard(rows));
  } else {
    const plans = group.plans;
    if (plans.length === 0) {
      const msg = await getMessage('buy.no_plans');
      await sendOrEdit(
        ctx,
        msg,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
      );
      return;
    }

    const msg = await getMessage('buy.select_plan');
    const buttons = plans.map((plan) => [
      Markup.button.callback(
        `🔹 ${plan.name} - ${formatBytes(Number(plan.data_limit))} - ${String(plan.duration_days)} روزه - ${formatPrice(plan.price)}`,
        `select_plan_${plan.id}`,
      ),
    ]);
    buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);

    await sendOrEdit(ctx, msg, Markup.inlineKeyboard(buttons));
  }
});

// ── Per-GB selection ──────────────────────────────────────────────
buyAccountScene.action(/^select_gb_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('⏳ در حال پردازش...');
  const gb = parseInt(ctx.match[1]);
  const db = getDb();

  const user = await db.user.findUnique({
    where: { id: ctx.session.userId! },
    include: { plan_group: true },
  });

  if (!user?.plan_group || user.plan_group.type !== 'per_gb') {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  const amount = gb * user.plan_group.price_per_gb!;
  const dataLimit = BigInt(gb) * BigInt(GB);
  const durationDays = user.plan_group.duration_days;
  const method = await getPaymentMethod();

  await handlePayment(ctx, {
    userId: user.id,
    planId: null,
    dataLimit,
    durationDays,
    amount,
    method,
  });
});

// ── Fixed plan selection ──────────────────────────────────────────
buyAccountScene.action(/^select_plan_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('⏳ در حال پردازش...');
  const planId = parseInt(ctx.match[1]);
  const db = getDb();
  const plan = await db.plan.findUnique({ where: { id: planId } });

  if (!plan) {
    await ctx.scene.enter(SCENE_BUY_ACCOUNT);
    return;
  }

  const method = await getPaymentMethod();

  await handlePayment(ctx, {
    userId: ctx.session.userId!,
    planId: plan.id,
    dataLimit: plan.data_limit,
    durationDays: plan.duration_days,
    amount: plan.price,
    method,
  });
});

// ── Shared payment handler ────────────────────────────────────────
interface PaymentParams {
  userId: number;
  planId: number | null;
  dataLimit: bigint;
  durationDays: number;
  amount: number;
  method: PaymentMethod;
}

async function handlePayment(ctx: BotContext, params: PaymentParams): Promise<void> {
  const db = getDb();

  if (params.method === 'premzy') {
    await handlePremzyPayment(ctx, db, params);
  } else {
    await handleManualPayment(ctx, db, params);
  }
}

async function handlePremzyPayment(
  ctx: BotContext,
  db: PrismaClient,
  params: PaymentParams,
): Promise<void> {
  const txn = await db.transaction.create({
    data: {
      user_id: params.userId,
      plan_id: params.planId,
      data_limit: params.dataLimit,
      duration_days: params.durationDays,
      amount: params.amount,
      method: 'premzy',
      status: 'checkout',
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
    `🛒 سفارش شما:\n` +
    `📦 حجم: ${dataLabel}\n` +
    `💰 مبلغ: ${priceLabel}\n\n` +
    `⚠️ <b>قبل از باز کردن لینک، VPN خود را خاموش کنید.</b>\n` +
    `⚠️ مبلغ نهایی ممکن است کمی متفاوت باشد.\n\n` +
    `برای پرداخت روی دکمه زیر کلیک کنید:`;

  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([
      [Markup.button.url('💳 پرداخت', checkoutUrl)],
      [Markup.button.callback('❌ انصراف', 'cancel_checkout')],
    ]),
  );
}

async function handleManualPayment(
  ctx: BotContext,
  db: PrismaClient,
  params: PaymentParams,
): Promise<void> {
  const card = await pickRandomCardForUser(params.userId);
  if (!card) {
    const noCardMsg = await getMessage('buy.no_card');
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
      method: 'manual',
      status: 'awaiting_receipt',
      bank_card_id: card.id,
    },
  });

  ctx.session.pendingTransactionId = txn.id;

  const instrMsg = await getMessage('buy.payment_instructions');
  await sendOrEdit(
    ctx,
    `${instrMsg}\n\nمبلغ: ${formatPrice(params.amount)}\nشماره کارت:\n<code>${formatCardNumber(card.card_number)}</code>\nبه نام: ${card.holder_name}\n\nپس از واریز، رسید خود را ارسال کنید.`,
  );

  await ctx.scene.enter(SCENE_PAYMENT_PENDING);
}

// ── Cancel checkout (premzy) ──────────────────────────────────────
buyAccountScene.action('cancel_checkout', async (ctx) => {
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
  await ctx.scene.enter(SCENE_HOME);
});

buyAccountScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
