import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../context';
import { SCENE_MANAGE_ACCOUNTS, SCENE_HOME, SCENE_VIEW_ACCOUNT } from './constants';
import { getMessage } from '../services/messageService';
import { sendOrEdit } from '../services/renderService';
import { getDb } from '../../core/db';
import { getMarzban } from '../../core/marzban';
import { formatBytes, formatDaysLeft } from '../../core/utils/format';

export const manageAccountsScene = new Scenes.BaseScene<BotContext>(SCENE_MANAGE_ACCOUNTS);

manageAccountsScene.enter(async (ctx) => {
  const db = getDb();
  const accounts = await db.account.findMany({
    where: { user_id: ctx.session.userId! },
    include: { plan: true },
  });

  if (accounts.length === 0) {
    const msg = await getMessage('manage.no_accounts');
    await sendOrEdit(
      ctx,
      msg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back')]]),
    );
    return;
  }

  const marzban = getMarzban();
  const lines: string[] = [];
  const buttons: ReturnType<typeof Markup.button.callback>[][] = [];

  for (const account of accounts) {
    try {
      const marzbanUser = await marzban.getUser(account.marzban_username);
      const used = formatBytes(marzbanUser.used_traffic);
      const limit = account.plan ? formatBytes(Number(account.plan.data_limit)) : 'نامحدود';
      const daysLeft = formatDaysLeft(account.expires_at);
      const name = account.plan?.name ?? 'تستی';

      lines.push(`🔹 ${name}\n   📊 ${used}/${limit} | ⏰ ${daysLeft} باقی‌مانده`);
      buttons.push([Markup.button.callback(name, `view_account_${account.id}`)]);
    } catch {
      const name = account.plan?.name ?? 'تستی';
      lines.push(`🔹 ${name}\n   ⚠️ خطا در دریافت اطلاعات`);
      buttons.push([Markup.button.callback(name, `view_account_${account.id}`)]);
    }
  }

  buttons.push([Markup.button.callback('🔙 بازگشت', 'back')]);

  const title = await getMessage('manage.title');
  await sendOrEdit(ctx, `${title}\n\n${lines.join('\n\n')}`, Markup.inlineKeyboard(buttons));
});

manageAccountsScene.action(/^view_account_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.selectedAccountId = parseInt(ctx.match[1]);
  await ctx.scene.enter(SCENE_VIEW_ACCOUNT);
});

manageAccountsScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter(SCENE_HOME);
});
