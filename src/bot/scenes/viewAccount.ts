import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_VIEW_ACCOUNT, SCENE_MANAGE_ACCOUNTS, SCENE_RENEW_ACCOUNT } from './constants';
import { getMessage } from '../services/messageService';
import { getSetting } from '../services/settingService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { getMarzban } from '../../core/marzban';
import { formatBytes, formatDaysLeft, buildSubUrl, fetchAndRenameConfigs, toEnglishDigits } from '../../core/utils/format';
import { loadEnv } from '../../core/utils/config';

/** Extract the numeric suffix from dove_123456 */
function getSuffix(marzbanUsername: string): string {
  const parts = marzbanUsername.split('_');
  return parts.length > 1 ? parts[parts.length - 1] : marzbanUsername;
}

/** Get the display name used in configs: display_name_suffix or marzban_username */
function getConfigName(account: { marzban_username: string; display_name: string | null }): string {
  if (account.display_name) {
    return `${account.display_name}_${getSuffix(account.marzban_username)}`;
  }
  return account.marzban_username;
}

/** Validate: only English letters, numbers, spaces (converted to _), underscores */
function sanitizeName(input: string): string | null {
  const cleaned = toEnglishDigits(input.trim()).replace(/\s+/g, '_');
  if (!/^[a-zA-Z0-9_]+$/.test(cleaned)) return null;
  if (cleaned.length === 0 || cleaned.length > 30) return null;
  return cleaned;
}

export const viewAccountScene = new Scenes.BaseScene<BotContext>(SCENE_VIEW_ACCOUNT);

viewAccountScene.enter(async (ctx) => {
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) {
    await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
    return;
  }

  await sendOrEdit(ctx, '⏳ در حال بارگذاری...');
  const db = getDb();
  const account = await db.account.findUnique({
    where: { id: accountId },
    include: { plan: true, seller: true },
  });

  if (!account) {
    await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
    return;
  }

  const marzban = getMarzban();
  const marzbanUser = await marzban.getUser(account.marzban_username);

  const title = await getMessage('view.title');
  const configName = getConfigName(account);
  const used = formatBytes(marzbanUser.used_traffic);
  const limit = marzbanUser.data_limit ? formatBytes(marzbanUser.data_limit) : 'نامحدود';
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
    `📛 نام: ${configName}\n` +
    `📊 مصرف: ${used} / ${limit}\n` +
    `⏰ انقضا: ${daysLeft}\n` +
    `🔗 وضعیت: ${status}`;

  if (isExpired) {
    const expiredMsg = await getMessage('view.expired');
    text += `\n\n${expiredMsg}`;
  }

  // Add subscription link + config links
  if (!isExpired && account.marzban_sub_token) {
    const env = loadEnv();
    const subUrl = buildSubUrl(env.SUB_BASE_URL, `/sub/${account.marzban_sub_token}`);
    const linkPrefix = account.seller?.link_prefix ?? env.CONFIG_LINK_PREFIX;
    const configs = await fetchAndRenameConfigs(
      env.MARZBAN_SUB_URL,
      account.marzban_sub_token,
      linkPrefix,
      configName,
    );
    text += `\n\n🔗 لینک اشتراک:\n<pre>${subUrl}</pre>`;
    if (configs.length > 0) {
      text += `\n📋 کانفیگ‌ها:`;
      for (const config of configs) {
        text += `\n<pre>${config}</pre>`;
      }
    }
  }

  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

  // Renew button: only for paid accounts when renew_enabled
  if (account.type === 'paid') {
    const renewEnabled = await getSetting('renew_enabled');
    if (renewEnabled === 'true') {
      buttons.push([Markup.button.callback('🔄 تمدید اکانت', 'renew_account')]);
    }
  }

  buttons.push([Markup.button.callback('✏️ تغییر نام', 'rename_account')]);
  buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);

  await sendOrEdit(ctx, text, Markup.inlineKeyboard(buttons));
});

viewAccountScene.action('renew_account', async (ctx) => {
  const renewEnabled = await getSetting('renew_enabled');
  if (renewEnabled !== 'true') {
    const disabledMsg = await getMessage('renew.disabled');
    await ctx.answerCbQuery(disabledMsg, { show_alert: true });
    return;
  }
  await ctx.answerCbQuery();
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) {
    await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
    return;
  }
  ctx.session.renewAccountId = accountId;
  await ctx.scene.enter(SCENE_RENEW_ACCOUNT);
});

viewAccountScene.action('rename_account', async (ctx) => {
  await ctx.answerCbQuery();
  const accountId = ctx.session.selectedAccountId;
  if (!accountId) {
    await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
    return;
  }

  const db = getDb();
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) {
    await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
    return;
  }

  const suffix = getSuffix(account.marzban_username);
  await sendOrEdit(
    ctx,
    `نام جدید را وارد کنید (حروف انگلیسی و اعداد):\n\nنام نهایی: <code>[نام شما]_${suffix}</code>`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'cancel_rename')]]),
  );
  ctx.session.awaitingRename = true;
});

viewAccountScene.action('cancel_rename', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.awaitingRename = false;
  await ctx.scene.enter(SCENE_VIEW_ACCOUNT);
});

viewAccountScene.on('message', async (ctx) => {
  if (!ctx.session.awaitingRename) return;
  if (!ctx.message || !('text' in ctx.message)) return;

  const input = ctx.message.text;
  const name = sanitizeName(input);

  if (!name) {
    await sendOrEdit(
      ctx,
      '❌ نام نامعتبر. فقط حروف انگلیسی، اعداد و فاصله مجاز است.',
      Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'cancel_rename')]]),
    );
    return;
  }

  const accountId = ctx.session.selectedAccountId;
  if (!accountId) {
    await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
    return;
  }

  const db = getDb();
  const account = await db.account.update({
    where: { id: accountId },
    data: { display_name: name },
  });

  const finalName = getConfigName(account);

  // Update Marzban user note so the name is tracked server-side
  try {
    const marzban = getMarzban();
    await marzban.modifyUser(account.marzban_username, { note: finalName });
  } catch (err) {
    console.error('Failed to update Marzban user note:', err);
  }

  ctx.session.awaitingRename = false;

  await sendOrEdit(ctx, `✅ نام اکانت تغییر کرد: <code>${finalName}</code>`);

  // Re-enter to show updated details
  await ctx.scene.enter(SCENE_VIEW_ACCOUNT);
});

viewAccountScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.awaitingRename = false;
  await ctx.scene.enter(SCENE_MANAGE_ACCOUNTS);
});
