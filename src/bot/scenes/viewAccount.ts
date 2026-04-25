import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_VIEW_ACCOUNT, SCENE_MANAGE_ACCOUNTS } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { getMarzban } from '../../core/marzban';
import { formatBytes, formatDaysLeft, buildSubUrl } from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';

export const viewAccountScene = new Scenes.BaseScene<BotContext>(SCENE_VIEW_ACCOUNT);

viewAccountScene.enter(async (ctx) => {
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) {
    await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
    return;
  }

  const db = getDb();
  const account = await db.account.findUnique({
    where: { id: accountId },
    include: { plan: true },
  });

  if (!account) {
    await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
    return;
  }

  const marzban = getMarzban();
  const marzbanUser = await marzban.getUser(account.marzban_username);

  const title = await getMessage('view.title');
  const name = account.plan?.name ?? 'تستی';
  const used = formatBytes(marzbanUser.used_traffic);
  const limit = account.plan ? formatBytes(Number(account.plan.data_limit)) : 'نامحدود';
  const daysLeft = formatDaysLeft(account.expires_at);

  const statusMap: Record<string, string> = {
    active: '✅ فعال',
    disabled: '❌ غیرفعال',
    limited: '⚠️ محدود شده',
    expired: '⏰ منقضی',
    on_hold: '⏸️ در انتظار',
  };
  const status = statusMap[marzbanUser.status] ?? marzbanUser.status;

  const isExpired = marzbanUser.status === 'expired' || marzbanUser.status === 'limited';

  let text =
    `${title}\n\n` +
    `📛 نام: ${name}\n` +
    `📊 مصرف: ${used} / ${limit}\n` +
    `⏰ انقضا: ${daysLeft}\n` +
    `🔗 وضعیت: ${status}`;

  if (isExpired) {
    const expiredMsg = await getMessage('view.expired');
    text += `\n\n${expiredMsg}`;
  }

  // Add config links inline
  if (!isExpired) {
    const env = loadEnv();
    const subUrl = buildSubUrl(env.SUB_BASE_URL, marzbanUser.proxies, account.marzban_username);
    text += `\n\n🔗 لینک اشتراک:\n${subUrl}`;
    if (marzbanUser.links && marzbanUser.links.length > 0) {
      text += `\n\n📋 لینک‌های مستقیم:\n${marzbanUser.links.join('\n')}`;
    }
  }

  await sendOrEdit(
    ctx,
    text,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
  );
});

viewAccountScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
});
