import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_BUY_ACCOUNT, SCENE_HOME, SCENE_PAYMENT_PENDING } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { formatBytes, formatPrice } from '../../core/utils/format';
import { BankCard } from '@prisma/client';

const GB = 1073741824;
const GB_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 100];

/** Pick a random active bank card. Returns null if none exist. */
async function pickRandomCard(): Promise<BankCard | null> {
  const db = getDb();
  const cards = await db.bankCard.findMany({ where: { is_active: true } });
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
    // Per-GB flow: show GB picker
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
    // Fixed flow: show plan list
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

// Per-GB: user picks GB count
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

  const card = await pickRandomCard();
  if (!card) {
    const noCardMsg = await getMessage('buy.no_card');
    await sendOrEdit(
      ctx,
      noCardMsg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
    );
    return;
  }

  const amount = gb * user.plan_group.price_per_gb!;
  const dataLimit = BigInt(gb) * BigInt(GB);

  const payment = await db.payment.create({
    data: {
      user_id: user.id,
      plan_id: null,
      bank_card_id: card.id,
      amount,
      data_limit: dataLimit,
      status: 'pending',
    },
  });

  ctx.session.selectedGb = gb;
  ctx.session.pendingPaymentId = payment.id;

  const msg = await getMessage('buy.payment_instructions');
  await sendOrEdit(
    ctx,
    `${msg}\n\nمبلغ: ${formatPrice(amount)}\nشماره کارت:\n<code>${formatCardNumber(card.card_number)}</code>\nبه نام: ${card.holder_name}\n\nپس از واریز، رسید خود را ارسال کنید.`,
  );

  await ctx.scene.enter(SCENE_PAYMENT_PENDING);
});

// Fixed: user picks a plan
buyAccountScene.action(/^select_plan_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('⏳ در حال پردازش...');
  const planId = parseInt(ctx.match[1]);
  const db = getDb();
  const plan = await db.plan.findUnique({ where: { id: planId } });

  if (!plan) {
    await ctx.scene.enter(SCENE_BUY_ACCOUNT);
    return;
  }

  const card = await pickRandomCard();
  if (!card) {
    const noCardMsg = await getMessage('buy.no_card');
    await sendOrEdit(
      ctx,
      noCardMsg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
    );
    return;
  }

  const payment = await db.payment.create({
    data: {
      user_id: ctx.session.userId!,
      plan_id: plan.id,
      bank_card_id: card.id,
      amount: plan.price,
      status: 'pending',
    },
  });

  ctx.session.selectedPlanId = plan.id;
  ctx.session.pendingPaymentId = payment.id;

  const msg = await getMessage('buy.payment_instructions');
  await sendOrEdit(
    ctx,
    `${msg}\n\nمبلغ: ${formatPrice(plan.price)}\nشماره کارت:\n<code>${formatCardNumber(card.card_number)}</code>\nبه نام: ${card.holder_name}\n\nپس از واریز، رسید خود را ارسال کنید.`,
  );

  await ctx.scene.enter(SCENE_PAYMENT_PENDING);
});

buyAccountScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
