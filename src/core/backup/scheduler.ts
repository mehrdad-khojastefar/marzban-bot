/**
 * Cron-driven backup scheduler.
 *
 * Reads `backup_enabled` and `backup_cron` from the bot_settings table
 * and schedules the runner via node-cron. The on/off toggle and the
 * cron expression are runtime-tunable — call `reschedule()` after a
 * settings write to apply the new values without a restart.
 *
 * If `backup_cron` is invalid, an `error.backup_misconfigured` event
 * is emitted and the scheduler falls back to DEFAULT_CRON so the
 * backup never silently stops running.
 */
import cron, { type ScheduledTask } from 'node-cron';
import type { Telegraf } from 'telegraf';

import type { BotContext } from '../../bot/context';
import { getSetting } from '../../bot/services/settingService';
import { logEvent } from '../events';
import { runBackups } from './runner';

export const DEFAULT_CRON = '0 3 * * *';
const SETTING_ENABLED = 'backup_enabled';
const SETTING_CRON = 'backup_cron';

let task: ScheduledTask | null = null;
let currentExpression: string | null = null;

async function resolveExpression(): Promise<string> {
  const raw = (await getSetting(SETTING_CRON)) ?? DEFAULT_CRON;
  if (cron.validate(raw)) return raw;

  logEvent('error.backup_misconfigured', {
    key: 'backup_cron',
    value: raw,
    reason: 'invalid cron expression — falling back to default',
  });
  return DEFAULT_CRON;
}

async function isEnabled(): Promise<boolean> {
  return (await getSetting(SETTING_ENABLED)) === 'true';
}

function stopTask(): void {
  if (task) {
    task.stop();
    task = null;
    currentExpression = null;
  }
}

export async function startBackupScheduler(bot: Telegraf<BotContext>): Promise<void> {
  stopTask();
  if (!(await isEnabled())) {
    console.log('[backup] scheduler not started — backup_enabled is not "true"');
    return;
  }

  const expression = await resolveExpression();
  task = cron.schedule(expression, () => {
    void runBackups({ bot, trigger: 'cron' }).catch((err) => {
      console.error('[backup] runBackups threw unexpectedly:', err);
    });
  });
  currentExpression = expression;
  console.log(`[backup] scheduler started: cron="${expression}"`);
}

export async function rescheduleBackupScheduler(
  bot: Telegraf<BotContext>,
): Promise<void> {
  await startBackupScheduler(bot);
}

export function stopBackupScheduler(): void {
  stopTask();
}

export function getCurrentExpression(): string | null {
  return currentExpression;
}
