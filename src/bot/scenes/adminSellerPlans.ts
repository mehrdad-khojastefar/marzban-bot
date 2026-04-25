import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_ADMIN_SELLER_PLANS, SCENE_ADMIN_SELLER_DETAIL } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { formatPrice, formatBytes, toPersianDigits } from '../../core/utils/format';

type AddPlanStep = 'idle' | 'name' | 'data' | 'price';

interface PlanDraft {
  name?: string;
  data_limit?: bigint;
}

let addPlanStep: AddPlanStep = 'idle';
let planDraft: PlanDraft = {};

export const adminSellerPlansScene = new Scenes.BaseScene<BotContext>(
  SCENE_ADMIN_SELLER_PLANS,
);

async function renderPlanList(ctx: BotContext) {
  const sellerId = ctx.session.managingSellerId;
  if (!sellerId) {
    await ctx.scene.enter(SCENE_ADMIN_SELLER_DETAIL);
    return;
  }

  const db = getDb();
  const seller = await db.seller.findUnique({
    where: { id: sellerId },
    include: { user: true },
  });
  const plans = await db.sellerPlan.findMany({
    where: { seller_id: sellerId },
    orderBy: { created_at: 'asc' },
  });

  const sellerName = seller?.user
    ? [seller.user.first_name, seller.user.last_name].filter(Boolean).join(' ')
    : String(seller?.chat_id ?? '');

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [
    [Markup.button.callback('➕ افزودن پلن', 'add_plan')],
  ];

  if (plans.length === 0) {
    await sendOrEdit(
      ctx,
      `📋 پلن‌های فروشنده: ${sellerName}\n\nهنوز پلنی تعریف نشده.`,
      Markup.inlineKeyboard([
        ...buttons,
        [Markup.button.callback('🔙 بازگشت', 'back_detail')],
      ]),
    );
    return;
  }

  const lines = plans.map((plan, i) => {
    const num = toPersianDigits(String(i + 1));
    const statusIcon = plan.is_active ? '✅' : '❌ غیرفعال';
    return `${num}. ${plan.name} - ${formatPrice(plan.price)} ${statusIcon}`;
  });

  for (const plan of plans) {
    const statusIcon = plan.is_active ? '✅' : '❌';
    buttons.push([
      Markup.button.callback(`${plan.name} ${statusIcon}`, `plan_${plan.id}`),
    ]);
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_detail')]);

  await sendOrEdit(
    ctx,
    `📋 پلن‌های فروشنده: ${sellerName}\n\n${lines.join('\n')}`,
    Markup.inlineKeyboard(buttons),
  );
}

adminSellerPlansScene.enter(async (ctx) => {
  addPlanStep = 'idle';
  planDraft = {};
  ctx.session.managingSellerPlanId = undefined;
  await renderPlanList(ctx);
});

adminSellerPlansScene.action('add_plan', async (ctx) => {
  await ctx.answerCbQuery();
  addPlanStep = 'name';
  planDraft = {};
  const msg = await getMessage('admin.plan_name_prompt');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
  );
});

adminSellerPlansScene.on('text', async (ctx) => {
  const input = ctx.message.text.trim();

  if (addPlanStep === 'name') {
    planDraft.name = input;
    addPlanStep = 'data';
    const msg = await getMessage('admin.plan_data_prompt');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
    );
    return;
  }

  if (addPlanStep === 'data') {
    const gb = parseFloat(input);
    if (isNaN(gb) || gb <= 0) {
      await sendOrEdit(
        ctx,
        'عدد معتبر وارد کنید.',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
      );
      return;
    }
    planDraft.data_limit = BigInt(Math.round(gb * 1073741824));
    addPlanStep = 'price';
    const msg = await getMessage('admin.plan_price_prompt');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
    );
    return;
  }

  if (addPlanStep === 'price') {
    const price = parseInt(input);
    if (isNaN(price) || price <= 0) {
      await sendOrEdit(
        ctx,
        'عدد معتبر وارد کنید.',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_list')]]),
      );
      return;
    }

    const sellerId = ctx.session.managingSellerId;
    if (!sellerId || !planDraft.name || !planDraft.data_limit) {
      addPlanStep = 'idle';
      return;
    }

    const db = getDb();
    await db.sellerPlan.create({
      data: {
        seller_id: sellerId,
        name: planDraft.name,
        data_limit: planDraft.data_limit,
        price,
      },
    });

    addPlanStep = 'idle';
    planDraft = {};

    await renderPlanList(ctx);
    return;
  }
});

adminSellerPlansScene.action(/^plan_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const planId = parseInt(ctx.match[1]);

  const db = getDb();
  const plan = await db.sellerPlan.findUnique({ where: { id: planId } });
  if (!plan) return;

  const dataDisplay = formatBytes(Number(plan.data_limit));
  const text =
    `پلن: ${plan.name}\n` +
    `حجم: ${dataDisplay}\n` +
    `قیمت: ${formatPrice(plan.price)}\n` +
    `وضعیت: ${plan.is_active ? 'فعال' : 'غیرفعال'}`;

  const toggleLabel = plan.is_active ? '❌ غیرفعال کردن' : '✅ فعال کردن';
  const toggleAction = plan.is_active ? `deactivate_${plan.id}` : `activate_${plan.id}`;

  await sendOrEdit(
    ctx,
    text,
    Markup.inlineKeyboard([
      [Markup.button.callback(toggleLabel, toggleAction)],
      [Markup.button.callback('🔙 بازگشت به لیست', 'back_list')],
    ]),
  );
});

adminSellerPlansScene.action(/^deactivate_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const planId = parseInt(ctx.match[1]);
  const db = getDb();
  await db.sellerPlan.update({ where: { id: planId }, data: { is_active: false } });
  await renderPlanList(ctx);
});

adminSellerPlansScene.action(/^activate_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const planId = parseInt(ctx.match[1]);
  const db = getDb();
  await db.sellerPlan.update({ where: { id: planId }, data: { is_active: true } });
  await renderPlanList(ctx);
});

adminSellerPlansScene.action('back_list', async (ctx) => {
  await ctx.answerCbQuery();
  addPlanStep = 'idle';
  planDraft = {};
  await renderPlanList(ctx);
});

adminSellerPlansScene.action('back_detail', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_ADMIN_SELLER_DETAIL);
});
