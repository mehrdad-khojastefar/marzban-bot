import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_BUY_ACCOUNT, SCENE_HOME, SCENE_PAYMENT_PENDING } from './constants';
import { getMessage } from '../services/messageService';
import { getDb } from '../../core/db';
import { formatBytes, formatPrice, toPersianDigits } from '../../core/utils/format';

export const buyAccountScene = new Scenes.BaseScene<BotContext>(SCENE_BUY_ACCOUNT);

buyAccountScene.enter(async (ctx) => {
  const db = getDb();
  const plans = await db.plan.findMany({ where: { is_active: true }, orderBy: { price: 'asc' } });

  if (plans.length === 0) {
    const msg = await getMessage('buy.no_plans');
    await ctx.reply(msg, Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]));
    return;
  }

  const msg = await getMessage('buy.select_plan');
  const buttons = plans.map((plan) => [
    Markup.button.callback(
      `🔹 ${plan.name} - ${formatBytes(Number(plan.data_limit))} - ${toPersianDigits(String(plan.duration_days))} روزه - ${formatPrice(plan.price)}`,
      `select_plan_${plan.id}`,
    ),
  ]);
  buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);

  await ctx.reply(msg, Markup.inlineKeyboard(buttons));
});

buyAccountScene.action(/^select_plan_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const planId = parseInt(ctx.match[1]);
  const db = getDb();
  const plan = await db.plan.findUnique({ where: { id: planId } });

  if (!plan) {
    await ctx.scene.enter(SCENE_BUY_ACCOUNT);
    return;
  }

  const payment = await db.payment.create({
    data: {
      user_id: ctx.session.userId!,
      plan_id: plan.id,
      amount: plan.price,
      status: 'pending',
    },
  });

  ctx.session.selectedPlanId = plan.id;
  ctx.session.pendingPaymentId = payment.id;

  const msg = await getMessage('buy.payment_instructions');
  const cardNumber = process.env.CARD_NUMBER ?? '';
  await ctx.reply(
    `${msg}\n\nمبلغ: ${formatPrice(plan.price)}\nشماره کارت: ${cardNumber}\n\nپس از واریز، رسید خود را ارسال کنید.`,
  );

  await ctx.scene.enter(SCENE_PAYMENT_PENDING);
});

buyAccountScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
