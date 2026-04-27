import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_ADMIN_PLAN_GROUPS, SCENE_HOME } from './constants';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { formatPrice, formatBytes, toEnglishDigits } from '../../core/utils/format';

const GB = 1073741824;

export const adminPlanGroupsScene = new Scenes.BaseScene<BotContext>(SCENE_ADMIN_PLAN_GROUPS);

async function renderGroupList(ctx: BotContext) {
  const db = getDb();
  const groups = await db.planGroup.findMany({
    include: {
      _count: { select: { users: true, plans: true } },
      plans: { where: { is_active: true }, orderBy: { price: 'asc' } },
    },
    orderBy: { created_at: 'asc' },
  });

  if (groups.length === 0) {
    await sendOrEdit(
      ctx,
      '📦 هیچ پلن‌گروپی وجود ندارد.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
    );
    return;
  }

  let text = '📦 پلن‌گروپ‌ها:\n\n';
  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

  for (const g of groups) {
    const status = g.is_active ? '✅' : '❌';
    const typeLabel = g.type === 'per_gb'
      ? `هر گیگ ${formatPrice(g.price_per_gb!)}`
      : `${String(g._count.plans)} پلن ثابت`;
    text += `${status} <b>${g.name}</b>\n`;
    text += `   نوع: ${typeLabel}\n`;
    text += `   کد: <code>${g.code}</code>\n`;
    text += `   لینک: <code>t.me/doveng_bot?start=${g.code}</code>\n`;
    text += `   کاربران: ${String(g._count.users)}\n`;

    if (g.type === 'fixed' && g.plans.length > 0) {
      for (const p of g.plans) {
        text += `      🔹 ${p.name} - ${formatBytes(Number(p.data_limit))} - ${formatPrice(p.price)}\n`;
      }
    }
    text += '\n';

    buttons.push([Markup.button.callback(`📝 ${g.name}`, `manage_group_${g.id}`)]);
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);

  await sendOrEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

async function renderGroupDetail(ctx: BotContext, groupId: number) {
  const db = getDb();
  const group = await db.planGroup.findUnique({
    where: { id: groupId },
    include: {
      plans: { orderBy: { price: 'asc' } },
      _count: { select: { users: true } },
    },
  });

  if (!group) {
    await renderGroupList(ctx);
    return;
  }

  let text = `📦 <b>${group.name}</b>\n\n`;
  text += `نوع: ${group.type === 'per_gb' ? 'هر گیگ' : 'پلن ثابت'}\n`;
  text += `کد: <code>${group.code}</code>\n`;
  text += `وضعیت: ${group.is_active ? '✅ فعال' : '❌ غیرفعال'}\n`;
  text += `کاربران: ${String(group._count.users)}\n`;

  if (group.type === 'per_gb') {
    text += `قیمت هر گیگ: ${formatPrice(group.price_per_gb!)}\n`;
  }

  if (group.plans.length > 0) {
    text += '\n📋 پلن‌ها:\n';
    for (const p of group.plans) {
      const pStatus = p.is_active ? '✅' : '❌';
      text += `${pStatus} ${p.name} - ${formatBytes(Number(p.data_limit))} - ${formatPrice(p.price)}\n`;
    }
  }

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [
    [Markup.button.callback('➕ اضافه کردن پلن', `add_plan_${group.id}`)],
    [Markup.button.callback('🔙 بازگشت به لیست', 'back_to_list')],
  ];

  await sendOrEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

adminPlanGroupsScene.enter(async (ctx) => {
  ctx.session.adminPlanStep = undefined;
  ctx.session.pendingPlanGb = undefined;
  ctx.session.managingGroupId = undefined;
  await renderGroupList(ctx);
});

// Manage a specific group
adminPlanGroupsScene.action(/^manage_group_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const groupId = parseInt(ctx.match[1]);
  ctx.session.managingGroupId = groupId;
  await renderGroupDetail(ctx, groupId);
});

// Start adding a plan to a group
adminPlanGroupsScene.action(/^add_plan_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const groupId = parseInt(ctx.match[1]);
  ctx.session.managingGroupId = groupId;
  ctx.session.adminPlanStep = 'gb';

  await sendOrEdit(
    ctx,
    'حجم پلن را به گیگابایت وارد کنید:',
    Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'cancel_add_plan')]]),
  );
});

adminPlanGroupsScene.action('cancel_add_plan', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminPlanStep = undefined;
  ctx.session.pendingPlanGb = undefined;
  const groupId = ctx.session.managingGroupId;
  if (groupId) {
    await renderGroupDetail(ctx, groupId);
  } else {
    await renderGroupList(ctx);
  }
});

adminPlanGroupsScene.action('back_to_list', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.managingGroupId = undefined;
  await renderGroupList(ctx);
});

adminPlanGroupsScene.on('message', async (ctx) => {
  if (!ctx.session.adminPlanStep) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const input = toEnglishDigits(ctx.message.text.trim());
  const groupId = ctx.session.managingGroupId;
  if (!groupId) return;

  if (ctx.session.adminPlanStep === 'gb') {
    const gb = parseInt(input);
    if (isNaN(gb) || gb <= 0 || gb > 1000) {
      await sendOrEdit(
        ctx,
        '❌ عدد نامعتبر. حجم را به گیگابایت وارد کنید (۱ تا ۱۰۰۰):',
        Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'cancel_add_plan')]]),
      );
      return;
    }
    ctx.session.pendingPlanGb = gb;
    ctx.session.adminPlanStep = 'price';
    await sendOrEdit(
      ctx,
      `حجم: ${String(gb)} گیگابایت\n\nقیمت را به تومان وارد کنید:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'cancel_add_plan')]]),
    );
  } else if (ctx.session.adminPlanStep === 'price') {
    const price = parseInt(input);
    if (isNaN(price) || price <= 0) {
      await sendOrEdit(
        ctx,
        '❌ عدد نامعتبر. قیمت را به تومان وارد کنید:',
        Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'cancel_add_plan')]]),
      );
      return;
    }

    const gb = ctx.session.pendingPlanGb!;
    const db = getDb();
    const group = await db.planGroup.findUnique({ where: { id: groupId } });
    if (!group) return;

    await db.plan.create({
      data: {
        group_id: groupId,
        name: `${String(gb)} گیگ`,
        data_limit: BigInt(gb) * BigInt(GB),
        duration_days: group.duration_days,
        price,
      },
    });

    ctx.session.adminPlanStep = undefined;
    ctx.session.pendingPlanGb = undefined;

    await sendOrEdit(ctx, `✅ پلن ${String(gb)} گیگ با قیمت ${formatPrice(price)} اضافه شد.`);
    await renderGroupDetail(ctx, groupId);
  }
});

adminPlanGroupsScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
