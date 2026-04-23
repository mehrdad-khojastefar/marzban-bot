import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_VIEW_ACCOUNT, SCENE_MANAGE_ACCOUNTS } from './constants';
import { getMessage } from '../services/messageService';
import { getDb } from '../../core/db';
import { getMarzban } from '../../core/marzban';
import { formatBytes, formatDaysLeft } from '../../core/utils/format';

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

  const text =
    `${title}\n\n` +
    `📛 نام: ${name}\n` +
    `📊 مصرف: ${used} / ${limit}\n` +
    `⏰ انقضا: ${daysLeft}\n` +
    `🔗 وضعیت: ${status}`;

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

  if (!isExpired) {
    buttons.push([Markup.button.callback('📋 دریافت کانفیگ', 'get_config')]);
  } else {
    const expiredMsg = await getMessage('view.expired');
    await ctx.reply(expiredMsg);
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);

  await ctx.reply(text, Markup.inlineKeyboard(buttons));
});

viewAccountScene.action('get_config', async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) return;

  const db = getDb();
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) return;

  const marzban = getMarzban();
  const marzbanUser = await marzban.getUser(account.marzban_username);

  const caption = await getMessage('view.config_caption');

  if (marzbanUser.subscription_url) {
    await ctx.reply(`${caption}\n\n${marzbanUser.subscription_url}`);
  } else if (marzbanUser.links && marzbanUser.links.length > 0) {
    await ctx.reply(`${caption}\n\n${marzbanUser.links.join('\n')}`);
  }
});

viewAccountScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
});
