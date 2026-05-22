import { Telegraf, Markup } from 'telegraf';
import { BotContext } from '../context';
import { getMessage } from '../services/messageService';
import { getSetting } from '../services/settingService';
import { isBackupRunning, runBackups } from '../../core/backup';
import { SCENE_HOME } from '../scenes/constants';

export function registerAdminBackupHandler(bot: Telegraf<BotContext>): void {
  const adminChatId = process.env.ADMIN_CHAT_ID;

  bot.action('admin_backup', async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;

    const enabled = await getSetting('backup_enabled');
    if (enabled !== 'true') {
      const disabled = await getMessage('admin.backup.disabled');
      await ctx.answerCbQuery(disabled, { show_alert: true });
      return;
    }

    if (isBackupRunning()) {
      const inProgress = await getMessage('admin.backup.in_progress');
      await ctx.answerCbQuery(inProgress, { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();
    const running = await getMessage('admin.backup.running');
    await ctx.editMessageText(
      running,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'admin_backup_back')]]),
    );

    const { results } = await runBackups({ bot, trigger: 'manual' });

    const allOk = results.length > 0 && results.every((r) => r.ok);
    if (allOk) {
      const done = await getMessage('admin.backup.done');
      await ctx.editMessageText(
        done,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'admin_backup_back')]]),
      );
      return;
    }

    const failed = results.filter((r) => !r.ok);
    const reason = failed.map((r) => `${r.db}: ${r.error ?? 'unknown'}`).join('\n');
    const failedMsg = await getMessage('admin.backup.failed', { reason });
    await ctx.editMessageText(
      failedMsg,
      Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'admin_backup_back')]]),
    );
  });

  bot.action('admin_backup_back', async (ctx) => {
    if (String(ctx.from!.id) !== adminChatId) return;
    await ctx.answerCbQuery();
    await ctx.scene.enter(SCENE_HOME);
  });
}
