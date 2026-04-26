import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_SELLER_VIEW_ACCOUNT, SCENE_SELLER_ACCOUNTS } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { getMarzban } from '../../core/marzban';
import {
  formatBytes,
  formatDaysLeft,
  formatPercent,
  formatProgressBar,
  toPersianDigits,
  buildSubUrl,
  renameConfigLinks,
} from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';

export const sellerViewAccountScene = new Scenes.BaseScene<BotContext>(
  SCENE_SELLER_VIEW_ACCOUNT,
);

async function renderDetail(ctx: BotContext) {
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) {
    await ctx.scene.enter(SCENE_SELLER_ACCOUNTS);
    return;
  }

  const db = getDb();
  const account = await db.account.findUnique({
    where: { id: accountId },
    include: { seller_plan: true, seller: true },
  });

  if (!account) {
    await ctx.scene.enter(SCENE_SELLER_ACCOUNTS);
    return;
  }

  const marzban = getMarzban();
  let usedTraffic = 0;
  let marzbanStatus = 'active';
  let marzbanProxies: Record<string, unknown> = {};
  let marzbanLinks: string[] = [];

  try {
    const marzbanUser = await marzban.getUser(account.marzban_username);
    usedTraffic = marzbanUser.used_traffic;
    marzbanStatus = marzbanUser.status;
    marzbanProxies = marzbanUser.proxies;
    marzbanLinks = marzbanUser.links ?? [];
  } catch {
    // If Marzban unreachable, show with zeros
  }

  const title = await getMessage('seller.account_detail');
  const planName = account.seller_plan?.name ?? '—';
  const dataLimit = account.seller_plan ? Number(account.seller_plan.data_limit) : 0;
  const used = formatBytes(usedTraffic);
  const limit = dataLimit > 0 ? formatBytes(dataLimit) : 'نامحدود';
  const percent = dataLimit > 0 ? formatPercent(usedTraffic, dataLimit) : 0;
  const progressBar = formatProgressBar(percent);
  const daysLeft = formatDaysLeft(account.expires_at);

  const statusMap: Record<string, string> = {
    active: 'فعال ✅',
    disabled: 'غیرفعال ❌',
    limited: 'محدود شده ⚠️',
    expired: 'منقضی ⏰',
    on_hold: 'در انتظار ⏸️',
  };
  const statusText = statusMap[marzbanStatus] ?? marzbanStatus;

  const paymentText =
    account.payment_status === 'paid' ? 'پرداخت شده ✅' : 'پرداخت نشده ⬜';
  const noteText = account.note || 'بدون یادداشت';

  const expireDate = toPersianDigits(
    account.expires_at.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
  );

  let text =
    `${title}\n\n` +
    `📛 نام: ${account.marzban_username}\n` +
    `📋 پلن: ${planName}\n` +
    `🔗 وضعیت: ${statusText}\n` +
    `📊 مصرف: ${used} از ${limit} (${toPersianDigits(String(percent))}٪)\n` +
    `${progressBar}\n` +
    `⏰ انقضا: ${daysLeft} مانده (${expireDate})\n` +
    `💰 پرداخت: ${paymentText}\n` +
    `📝 یادداشت: ${noteText}`;

  // Include subscription link inline
  const env = loadEnv();
  const subUrl = buildSubUrl(env.SUB_BASE_URL, marzbanProxies, account.marzban_username);
  text += `\n\n🔗 لینک اشتراک:\n<pre>${subUrl}</pre>`;
  if (marzbanLinks.length > 0) {
    const linkPrefix = account.seller?.link_prefix ?? env.CONFIG_LINK_PREFIX;
    const renamed = renameConfigLinks(marzbanLinks, linkPrefix, account.marzban_username);
    text += `\n📋 لینک‌های مستقیم:\n<pre>${renamed.join('\n')}</pre>`;
  }

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [
    [Markup.button.callback('✏️ ویرایش یادداشت', 'edit_note')],
    [Markup.button.callback('🔙 بازگشت', 'back_accounts')],
  ];

  await sendOrEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

sellerViewAccountScene.enter(async (ctx) => {
  await renderDetail(ctx);
});

sellerViewAccountScene.action('edit_note', async (ctx) => {
  await ctx.answerCbQuery();
  const msg = await getMessage('seller.enter_new_note');
  await sendOrEdit(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_accounts')]]),
  );
});

sellerViewAccountScene.on('text', async (ctx) => {
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) return;

  const note = ctx.message.text.trim();
  const db = getDb();
  await db.account.update({
    where: { id: accountId },
    data: { note },
  });

  await renderDetail(ctx);
});

sellerViewAccountScene.action('back_accounts', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_SELLER_ACCOUNTS);
});
