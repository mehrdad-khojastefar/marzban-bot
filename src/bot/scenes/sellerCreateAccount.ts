import crypto from 'node:crypto';
import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_SELLER_CREATE_ACCOUNT, SCENE_SELLER_PANEL, SCENE_HOME } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { getMarzban } from '../../core/marzban';
import { formatPrice, toPersianDigits, buildSubUrl } from '../../core/utils/format';
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

export const sellerCreateAccountScene = new Scenes.BaseScene<BotContext>(
  SCENE_SELLER_CREATE_ACCOUNT,
);

sellerCreateAccountScene.enter(async (ctx) => {
  const sellerId = ctx.session.sellerId;
  if (!sellerId) {
    await ctx.scene.enter(SCENE_SELLER_PANEL);
    return;
  }

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
  const buttons = plans.map((plan) => [
    Markup.button.callback(
      `${plan.name} - ${formatPrice(plan.price)}`,
      `select_plan_${plan.id}`,
    ),
  ]);
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
      data_limit: Number(plan.data_limit),
      expire: expireTimestamp,
      status: 'active',
    });

    const account = await db.account.create({
      data: {
        user_id: seller.user_id,
        seller_id: sellerId,
        seller_plan_id: plan.id,
        marzban_username: marzbanUsername,
        type: 'paid',
        payment_status: 'unpaid',
        expires_at: expiresAt,
      },
    });

    ctx.session.selectedAccountId = account.id;

    const successMsg = await getMessage('seller.account_created', {
      name: marzbanUsername,
      plan: plan.name,
      expire_date: formatJalaliDate(expiresAt),
    });

    const notePrompt = await getMessage('seller.enter_note');

    await sendOrEdit(
      ctx,
      `${successMsg}\n\n${notePrompt}`,
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
});

sellerCreateAccountScene.action('skip_note', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SELLER_PANEL);
});

sellerCreateAccountScene.on('text', async (ctx) => {
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) {
    await ctx.scene.enter(SCENE_SELLER_PANEL);
    return;
  }

  const note = ctx.message.text.trim();
  if (note) {
    const db = getDb();
    await db.account.update({
      where: { id: accountId },
      data: { note },
    });
  }

  await ctx.scene.enter(SCENE_SELLER_PANEL);
});

sellerCreateAccountScene.action('back_panel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SELLER_PANEL);
});
