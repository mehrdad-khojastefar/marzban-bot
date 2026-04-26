import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import {
  SCENE_ADMIN_VIEW_ACCOUNT,
  SCENE_ADMIN_SELLER_ACCOUNTS,
  SCENE_ADMIN_ACCOUNTS,
} from './constants';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { getMarzban } from '../../core/marzban';
import {
  formatBytes,
  formatDaysLeft,
  formatPercent,
  formatProgressBar,
  formatPrice,
  toPersianDigits,
  buildSubUrl,
  renameConfigLinks,
} from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';

function getBackScene(ctx: BotContext): string {
  return ctx.session.adminAccountsFrom === 'global'
    ? SCENE_ADMIN_ACCOUNTS
    : SCENE_ADMIN_SELLER_ACCOUNTS;
}

export const adminViewAccountScene = new Scenes.BaseScene<BotContext>(
  SCENE_ADMIN_VIEW_ACCOUNT,
);

async function renderDetail(ctx: BotContext) {
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) {
    await ctx.scene.enter(getBackScene(ctx));
    return;
  }

  ctx.session.adminEditField = undefined;

  const db = getDb();
  const account = await db.account.findUnique({
    where: { id: accountId },
    include: { seller_plan: true, seller: { include: { user: true } } },
  });

  if (!account) {
    await ctx.scene.enter(getBackScene(ctx));
    return;
  }

  const marzban = getMarzban();
  let usedTraffic = 0;
  let marzbanStatus = 'active';
  let marzbanProxies: Record<string, unknown> = {};
  let marzbanLinks: string[] = [];
  let dataLimitLive = account.seller_plan ? Number(account.seller_plan.data_limit) : 0;

  try {
    const marzbanUser = await marzban.getUser(account.marzban_username);
    usedTraffic = marzbanUser.used_traffic;
    marzbanStatus = marzbanUser.status;
    marzbanProxies = marzbanUser.proxies;
    marzbanLinks = marzbanUser.links ?? [];
    if (marzbanUser.data_limit) {
      dataLimitLive = marzbanUser.data_limit;
    }
  } catch {
    // Marzban unreachable
  }

  const statusMap: Record<string, string> = {
    active: 'فعال ✅',
    disabled: 'غیرفعال ❌',
    limited: 'محدود شده ⚠️',
    expired: 'منقضی ⏰',
    on_hold: 'در انتظار ⏸️',
  };
  const statusText = statusMap[marzbanStatus] ?? marzbanStatus;
  const paymentText = account.payment_status === 'paid' ? 'پرداخت شده ✅' : 'پرداخت نشده ⬜';
  const planName = account.seller_plan?.name ?? '—';
  const planType = account.seller_plan?.type === 'per_unit' ? '(واحدی)' : '(ثابت)';
  const used = formatBytes(usedTraffic);
  const limit = dataLimitLive > 0 ? formatBytes(dataLimitLive) : 'نامحدود';
  const percent = dataLimitLive > 0 ? formatPercent(usedTraffic, dataLimitLive) : 0;
  const progressBar = formatProgressBar(percent);
  const daysLeft = formatDaysLeft(account.expires_at);
  const noteText = account.note || '—';
  const priceText = account.price ? formatPrice(account.price) : '—';

  const expireDate = toPersianDigits(
    account.expires_at.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
  );

  const sellerName = account.seller?.user
    ? [account.seller.user.first_name, account.seller.user.last_name].filter(Boolean).join(' ')
    : '—';

  const env = loadEnv();
  const subUrl = buildSubUrl(env.SUB_BASE_URL, marzbanProxies, account.marzban_username);

  let text =
    `🔧 مدیریت اکانت\n\n` +
    `📛 نام: ${account.marzban_username}\n` +
    `👤 فروشنده: ${sellerName}\n` +
    `📋 پلن: ${planName} ${planType}\n` +
    `🔗 وضعیت: ${statusText}\n` +
    `📊 مصرف: ${used} از ${limit} (${toPersianDigits(String(percent))}٪)\n` +
    `${progressBar}\n` +
    `⏰ انقضا: ${daysLeft} مانده (${expireDate})\n` +
    `💰 قیمت: ${priceText}\n` +
    `💳 پرداخت: ${paymentText}\n` +
    `📝 یادداشت: ${noteText}\n\n` +
    `🔗 لینک اشتراک:\n${subUrl}`;

  if (marzbanLinks.length > 0) {
    const renamed = renameConfigLinks(marzbanLinks, env.CONFIG_LINK_PREFIX, account.marzban_username);
    text += `\n\n📋 لینک‌های مستقیم:\n${renamed.join('\n')}`;
  }

  const isDisabled = marzbanStatus === 'disabled';

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [
    [
      Markup.button.callback('📊 تغییر پلن / حجم', 'change_plan'),
      Markup.button.callback('⏰ تغییر انقضا', 'edit_expire'),
    ],
    [
      Markup.button.callback('💰 تغییر قیمت', 'edit_price'),
      Markup.button.callback('📝 ویرایش یادداشت', 'edit_note'),
    ],
    [Markup.button.callback('🔄 ریست مصرف', 'reset_usage')],
    [
      Markup.button.callback(
        isDisabled ? '🟢 فعال کردن' : '🔴 غیرفعال کردن',
        isDisabled ? 'enable_account' : 'disable_account',
      ),
    ],
    [
      Markup.button.callback(
        account.payment_status === 'paid' ? '⬜ برگشت به پرداخت‌نشده' : '✅ تسویه',
        'toggle_payment',
      ),
    ],
    [Markup.button.callback('🗑 حذف اکانت', 'delete_account')],
    [Markup.button.callback('🔙 بازگشت', 'back_accounts')],
  ];

  await sendOrEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

adminViewAccountScene.enter(async (ctx) => {
  await renderDetail(ctx);
});

// --- Change plan / data limit ---
adminViewAccountScene.action('change_plan', async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) return;

  const db = getDb();
  const account = await db.account.findUnique({
    where: { id: accountId },
    include: { seller_plan: true },
  });
  if (!account || !account.seller_id) return;

  const sellerPlans = await db.sellerPlan.findMany({
    where: { seller_id: account.seller_id, is_active: true },
  });

  if (account.seller_plan?.type === 'per_unit') {
    // Per-unit: ask for new GB, recalculate price
    ctx.session.adminEditField = 'data_limit';
    const unitSize = formatBytes(Number(account.seller_plan.data_limit));
    const unitPrice = formatPrice(account.seller_plan.price);
    await sendOrEdit(
      ctx,
      `📏 پلن واحدی: ${account.seller_plan.name}\nهر ${unitSize} = ${unitPrice}\n\nتعداد واحد جدید را وارد کنید:`,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'cancel_edit')]]),
    );
  } else {
    // Fixed: show seller's plans to pick from
    const buttons = sellerPlans.map((plan) => [
      Markup.button.callback(
        `${plan.name} - ${formatBytes(Number(plan.data_limit))} - ${formatPrice(plan.price)}`,
        `switch_plan_${plan.id}`,
      ),
    ]);
    buttons.push([Markup.button.callback('🔙 بازگشت', 'cancel_edit')]);

    await sendOrEdit(
      ctx,
      'پلن جدید را انتخاب کنید:',
      Markup.inlineKeyboard(buttons),
    );
  }
});

// Fixed plan switch
adminViewAccountScene.action(/^switch_plan_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const planId = parseInt(ctx.match[1]);
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) return;

  const db = getDb();
  const plan = await db.sellerPlan.findUnique({ where: { id: planId } });
  if (!plan) return;

  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) return;

  // Update Marzban
  const marzban = getMarzban();
  await marzban.modifyUser(account.marzban_username, {
    data_limit: Number(plan.data_limit),
  });

  // Update DB
  await db.account.update({
    where: { id: accountId },
    data: {
      seller_plan_id: plan.id,
      price: plan.price,
    },
  });

  await renderDetail(ctx);
});

// --- Edit expiry ---
adminViewAccountScene.action('edit_expire', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminEditField = 'expire';
  await sendOrEdit(
    ctx,
    'تعداد روز جدید از الان را وارد کنید:\n(مثلاً ۳۰ برای ۳۰ روز از الان)',
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'cancel_edit')]]),
  );
});

// --- Edit price ---
adminViewAccountScene.action('edit_price', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminEditField = 'price';
  await sendOrEdit(
    ctx,
    'قیمت جدید را به تومان وارد کنید:',
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'cancel_edit')]]),
  );
});

// --- Edit note ---
adminViewAccountScene.action('edit_note', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminEditField = 'note';
  await sendOrEdit(
    ctx,
    'یادداشت جدید را وارد کنید:',
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'cancel_edit')]]),
  );
});

// --- Text input handler for all edit fields ---
adminViewAccountScene.on('text', async (ctx) => {
  const input = ctx.message.text.trim();
  const accountId = ctx.session.selectedAccountId;
  if (!accountId || !ctx.session.adminEditField) return;

  const db = getDb();
  const account = await db.account.findUnique({
    where: { id: accountId },
    include: { seller_plan: true },
  });
  if (!account) return;

  const backButton = Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'cancel_edit')]]);

  if (ctx.session.adminEditField === 'data_limit') {
    const quantity = parseFloat(input);
    if (isNaN(quantity) || quantity <= 0) {
      await sendOrEdit(ctx, 'عدد معتبر وارد کنید.', backButton);
      return;
    }

    if (!account.seller_plan) return;
    const unitBytes = Number(account.seller_plan.data_limit);
    const unitPrice = account.seller_plan.price;
    const newDataLimit = Math.round(unitBytes * quantity);
    const newPrice = Math.round(unitPrice * quantity);

    const marzban = getMarzban();
    await marzban.modifyUser(account.marzban_username, { data_limit: newDataLimit });
    await db.account.update({
      where: { id: accountId },
      data: { price: newPrice },
    });

    ctx.session.adminEditField = undefined;
    await renderDetail(ctx);
    return;
  }

  if (ctx.session.adminEditField === 'expire') {
    const days = parseInt(input);
    if (isNaN(days) || days <= 0) {
      await sendOrEdit(ctx, 'عدد معتبر وارد کنید.', backButton);
      return;
    }

    const newExpireTimestamp = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
    const newExpiresAt = new Date(newExpireTimestamp * 1000);

    const marzban = getMarzban();
    await marzban.modifyUser(account.marzban_username, { expire: newExpireTimestamp });
    await db.account.update({
      where: { id: accountId },
      data: { expires_at: newExpiresAt },
    });

    ctx.session.adminEditField = undefined;
    await renderDetail(ctx);
    return;
  }

  if (ctx.session.adminEditField === 'price') {
    const price = parseInt(input);
    if (isNaN(price) || price < 0) {
      await sendOrEdit(ctx, 'عدد معتبر وارد کنید.', backButton);
      return;
    }

    await db.account.update({
      where: { id: accountId },
      data: { price },
    });

    ctx.session.adminEditField = undefined;
    await renderDetail(ctx);
    return;
  }

  if (ctx.session.adminEditField === 'note') {
    await db.account.update({
      where: { id: accountId },
      data: { note: input || null },
    });

    ctx.session.adminEditField = undefined;
    await renderDetail(ctx);
    return;
  }
});

adminViewAccountScene.action('cancel_edit', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminEditField = undefined;
  await renderDetail(ctx);
});

// --- Reset usage ---
adminViewAccountScene.action('reset_usage', async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) return;

  const db = getDb();
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) return;

  const marzban = getMarzban();
  await marzban.resetUserDataUsage(account.marzban_username);
  await renderDetail(ctx);
});

// --- Enable / Disable ---
adminViewAccountScene.action('disable_account', async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) return;

  const db = getDb();
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) return;

  const marzban = getMarzban();
  await marzban.modifyUser(account.marzban_username, { status: 'disabled' });
  await renderDetail(ctx);
});

adminViewAccountScene.action('enable_account', async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) return;

  const db = getDb();
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) return;

  const marzban = getMarzban();
  await marzban.modifyUser(account.marzban_username, { status: 'active' });
  await renderDetail(ctx);
});

// --- Toggle payment ---
adminViewAccountScene.action('toggle_payment', async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) return;

  const db = getDb();
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) return;

  const newStatus = account.payment_status === 'paid' ? 'unpaid' : 'paid';
  await db.account.update({
    where: { id: accountId },
    data: { payment_status: newStatus },
  });

  await renderDetail(ctx);
});

// --- Delete account ---
adminViewAccountScene.action('delete_account', async (ctx) => {
  await ctx.answerCbQuery();
  await sendOrEdit(
    ctx,
    '⚠️ آیا از حذف این اکانت مطمئن هستید؟\nاین عمل غیرقابل بازگشت است.',
    Markup.inlineKeyboard([
      [
        Markup.button.callback('🗑 بله، حذف شود', 'confirm_delete'),
        Markup.button.callback('🔙 انصراف', 'cancel_edit'),
      ],
    ]),
  );
});

adminViewAccountScene.action('confirm_delete', async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) return;

  const db = getDb();
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) return;

  const marzban = getMarzban();
  try {
    await marzban.removeUser(account.marzban_username);
  } catch {
    // May already be deleted on Marzban
  }

  await db.account.delete({ where: { id: accountId } });

  ctx.session.selectedAccountId = undefined;
  await ctx.scene.enter(SCENE_ADMIN_SELLER_ACCOUNTS);
});

// --- Back ---
adminViewAccountScene.action('back_accounts', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_ADMIN_SELLER_ACCOUNTS);
});
