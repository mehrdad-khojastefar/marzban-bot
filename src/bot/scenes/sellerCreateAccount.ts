import crypto from 'node:crypto';
import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_SELLER_CREATE_ACCOUNT, SCENE_SELLER_PANEL, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { getMarzban } from '../../core/marzban';
import { formatPrice, formatBytes, toPersianDigits, buildSubUrl } from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';

const SELLER_ACCOUNT_DURATION_DAYS = 30;

function generateUsername(): string {
  return 's_' + crypto.randomBytes(3).toString('hex').slice(0, 6);
}

function formatJalaliDate(date: Date): string {
  return toPersianDigits(
    date.toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }),
  );
}

async function provisionAccount(
  ctx: BotContext,
  dataLimit: number,
  price: number,
  planId: number,
  planName: string,
) {
  const sellerId = ctx.session.sellerId!;
  const db = getDb();

  const seller = await db.seller.findUnique({ where: { id: sellerId } });
  if (!seller || !seller.user_id) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  try {
    const marzban = getMarzban();
    const marzbanUsername = generateUsername();
    const expireTimestamp =
      Math.floor(Date.now() / 1000) + SELLER_ACCOUNT_DURATION_DAYS * 24 * 60 * 60;
    const expiresAt = new Date(expireTimestamp * 1000);

    const inbounds = await marzban.getInbounds();
    const enabledProtocols = Object.keys(inbounds).filter(
      (proto) => inbounds[proto as keyof typeof inbounds]?.length > 0,
    );
    const proxies: Record<string, Record<string, unknown>> = {};
    for (const proto of enabledProtocols) {
      proxies[proto] = {};
    }

    const marzbanUser = await marzban.addUser({
      username: marzbanUsername,
      proxies,
      data_limit: dataLimit,
      expire: expireTimestamp,
      status: 'active',
    });

    const account = await db.account.create({
      data: {
        user_id: seller.user_id,
        seller_id: sellerId,
        seller_plan_id: planId,
        marzban_username: marzbanUsername,
        type: 'paid',
        payment_status: 'unpaid',
        price,
        expires_at: expiresAt,
      },
    });

    ctx.session.selectedAccountId = account.id;
    ctx.session.awaitingQuantity = false;

    const successMsg = await getMessage('seller.account_created', {
      name: marzbanUsername,
      plan: `${planName} (${formatBytes(dataLimit)})`,
      expire_date: formatJalaliDate(expiresAt),
    });

    const notePrompt = await getMessage('seller.enter_note');

    await sendOrEdit(
      ctx,
      `${successMsg}\nقیمت: ${formatPrice(price)}\n\n${notePrompt}`,
      Markup.inlineKeyboard([[Markup.button.callback('⏭ رد کردن', 'skip_note')]]),
    );

    // Config links sent as separate message (exception)
    const configCaption = await getMessage('view.config_caption');
    const env = loadEnv();
    const parts: string[] = [];

    const subUrl = buildSubUrl(env.SUB_BASE_URL, marzbanUser.proxies, marzbanUsername);
    parts.push(`🔗 لینک اشتراک:\n${subUrl}`);

    if (marzbanUser.links && marzbanUser.links.length > 0) {
      parts.push(`📋 لینک‌های مستقیم:\n${marzbanUser.links.join('\n')}`);
    }

    await ctx.reply(`${configCaption}\n\n${parts.join('\n\n')}`);
  } catch (err) {
    console.error('Seller account provisioning failed:', err);
    const failMsg = await getMessage('seller.create_failed');
    await sendOrEdit(
      ctx,
      failMsg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_panel')]]),
    );
  }
}

export const sellerCreateAccountScene = new Scenes.BaseScene<BotContext>(
  SCENE_SELLER_CREATE_ACCOUNT,
);

sellerCreateAccountScene.enter(async (ctx) => {
  const sellerId = ctx.session.sellerId;
  if (!sellerId) {
    await ctx.scene.enter(SCENE_SELLER_PANEL);
    return;
  }

  ctx.session.awaitingQuantity = false;
  ctx.session.selectedSellerPlanId = undefined;

  const db = getDb();
  const seller = await db.seller.findUnique({ where: { id: sellerId } });
  if (!seller || !seller.is_active) {
    await ctx.scene.enter(SCENE_HOME);
    return;
  }

  const plans = await db.sellerPlan.findMany({
    where: { seller_id: sellerId, is_active: true },
  });

  if (plans.length === 0) {
    const msg = await getMessage('seller.no_plans');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_panel')]]),
    );
    return;
  }

  const msg = await getMessage('seller.select_plan');
  const buttons = plans.map((plan) => {
    const label =
      plan.type === 'per_unit'
        ? `${plan.name} - هر ${formatBytes(Number(plan.data_limit))} ${formatPrice(plan.price)}`
        : `${plan.name} - ${formatBytes(Number(plan.data_limit))} - ${formatPrice(plan.price)}`;
    return [Markup.button.callback(label, `select_plan_${plan.id}`)];
  });
  buttons.push([Markup.button.callback('🔙 بازگشت', 'back_panel')]);

  await sendOrEdit(ctx, msg, Markup.inlineKeyboard(buttons));
});

sellerCreateAccountScene.action(/^select_plan_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const planId = parseInt(ctx.match[1]);
  const sellerId = ctx.session.sellerId;
  if (!sellerId) {
    await ctx.scene.enter(SCENE_SELLER_PANEL);
    return;
  }

  const db = getDb();
  const plan = await db.sellerPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.seller_id !== sellerId || !plan.is_active) {
    await ctx.scene.enter(SCENE_SELLER_PANEL);
    return;
  }

  if (plan.type === 'per_unit') {
    // Ask for quantity
    ctx.session.selectedSellerPlanId = plan.id;
    ctx.session.awaitingQuantity = true;

    const unitSize = formatBytes(Number(plan.data_limit));
    const unitPrice = formatPrice(plan.price);
    await sendOrEdit(
      ctx,
      `📦 پلن: ${plan.name}\nهر ${unitSize} = ${unitPrice}\n\nچند واحد می‌خواهید؟ (عدد وارد کنید)`,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_plans')]]),
    );
    return;
  }

  // Fixed plan — provision immediately
  await provisionAccount(
    ctx,
    Number(plan.data_limit),
    plan.price,
    plan.id,
    plan.name,
  );
});

sellerCreateAccountScene.action('back_plans', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.awaitingQuantity = false;
  ctx.session.selectedSellerPlanId = undefined;
  await ctx.scene.enter(SCENE_SELLER_CREATE_ACCOUNT);
});

sellerCreateAccountScene.action('skip_note', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SELLER_PANEL);
});

sellerCreateAccountScene.on('text', async (ctx) => {
  const input = ctx.message.text.trim();

  // Waiting for per-unit quantity
  if (ctx.session.awaitingQuantity && ctx.session.selectedSellerPlanId) {
    const quantity = parseFloat(input);
    if (isNaN(quantity) || quantity <= 0) {
      await sendOrEdit(
        ctx,
        'عدد معتبر وارد کنید.',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_plans')]]),
      );
      return;
    }

    const db = getDb();
    const plan = await db.sellerPlan.findUnique({
      where: { id: ctx.session.selectedSellerPlanId },
    });
    if (!plan) {
      await ctx.scene.enter(SCENE_SELLER_PANEL);
      return;
    }

    const totalData = Math.round(Number(plan.data_limit) * quantity);
    const totalPrice = Math.round(plan.price * quantity);

    await provisionAccount(ctx, totalData, totalPrice, plan.id, plan.name);
    return;
  }

  // Waiting for note
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) {
    await ctx.scene.enter(SCENE_SELLER_PANEL);
    return;
  }

  if (input) {
    const db = getDb();
    await db.account.update({
      where: { id: accountId },
      data: { note: input },
    });
  }

  await ctx.scene.enter(SCENE_SELLER_PANEL);
});

sellerCreateAccountScene.action('back_panel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SELLER_PANEL);
});
