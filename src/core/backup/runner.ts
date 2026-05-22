/**
 * Backup runner.
 *
 * Orchestrates the two-DB pipeline. Sequential — one pg_dump and one
 * Telegram upload at a time. Holds an in-process lock so that overlapping
 * cron ticks (or a manual press during a running cron job) cannot start
 * a second run; the second caller gets `system.backup_skipped` with
 * reason `already_running`.
 *
 * Each DB is independent — a failure on one does NOT abort the other.
 */
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Telegraf } from 'telegraf';

import type { BotContext } from '../../bot/context';
import { loadEnv } from '../utils/config';
import { logEvent } from '../events';
import type { BackupDbName, BackupTrigger } from '../events/types';
import { runDump, DumpError, type Spawner, type DumpResult } from './dump';
import { sendBackupToTelegram } from './uploader';

let isRunning = false;

function timestamp(now: Date = new Date()): string {
  const iso = now.toISOString();
  return iso.slice(0, 10).replace(/-/g, '') + '-' + iso.slice(11, 19).replace(/:/g, '');
}

interface DbTarget {
  name: BackupDbName;
  connectionString: string;
  topicId: number;
}

export interface RunBackupsOptions {
  bot: Telegraf<BotContext>;
  trigger: BackupTrigger;
  spawner?: Spawner;
  unlinker?: (path: string) => Promise<void>;
}

export interface RunBackupsResult {
  skipped: 'already_running' | null;
  results: Array<{
    db: BackupDbName;
    ok: boolean;
    meta?: DumpResult;
    error?: string;
  }>;
}

async function unlinkSafe(path: string, unlinker: (p: string) => Promise<void>): Promise<void> {
  try {
    await unlinker(path);
  } catch {
    // Already gone or never created.
  }
}

async function backupOne(
  target: DbTarget,
  bot: Telegraf<BotContext>,
  trigger: BackupTrigger,
  groupId: string,
  spawner: Spawner | undefined,
  unlinker: (path: string) => Promise<void>,
): Promise<{ db: BackupDbName; ok: boolean; meta?: DumpResult; error?: string }> {
  const outPath = join(tmpdir(), `${target.name}-${timestamp()}.sql.gz`);
  let meta: DumpResult;

  try {
    meta = await runDump({
      connectionString: target.connectionString,
      outPath,
      spawner,
    });
  } catch (err) {
    await unlinkSafe(outPath, unlinker);
    const stage = err instanceof DumpError ? err.stage : 'pg_dump';
    const message = (err as Error).message;
    logEvent('error.backup_failed', { db: target.name, stage, message, trigger });
    return { db: target.name, ok: false, error: message };
  }

  try {
    await sendBackupToTelegram({
      telegram: bot.telegram,
      groupId,
      topicId: target.topicId,
      db: target.name,
      filePath: outPath,
      meta,
    });
  } catch (err) {
    const message = (err as Error).message;
    logEvent('error.backup_failed', { db: target.name, stage: 'upload', message, trigger });
    await unlinkSafe(outPath, unlinker);
    return { db: target.name, ok: false, meta, error: message };
  }

  await unlinkSafe(outPath, unlinker);

  logEvent('system.backup_completed', {
    db: target.name,
    sizeBytes: meta.sizeBytes,
    sha256: meta.sha256,
    durationMs: meta.durationMs,
    trigger,
  });

  return { db: target.name, ok: true, meta };
}

export async function runBackups({
  bot,
  trigger,
  spawner,
  unlinker = unlink,
}: RunBackupsOptions): Promise<RunBackupsResult> {
  if (isRunning) {
    logEvent('system.backup_skipped', { trigger, reason: 'already_running' });
    return { skipped: 'already_running', results: [] };
  }
  isRunning = true;

  const env = loadEnv();
  const targets: DbTarget[] = [
    {
      name: 'marzban',
      connectionString: env.MARZBAN_DATABASE_URL,
      topicId: env.LOG_TOPIC_BACKUP_MARZBAN,
    },
    {
      name: 'marzban_bot',
      connectionString: env.DATABASE_URL,
      topicId: env.LOG_TOPIC_BACKUP_BOT,
    },
  ];

  logEvent('system.backup_started', { trigger, dbs: targets.map((t) => t.name) });

  const results: RunBackupsResult['results'] = [];
  try {
    for (const target of targets) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      const result = await backupOne(
        target,
        bot,
        trigger,
        env.LOG_GROUP_ID,
        spawner,
        unlinker,
      );
      results.push(result);
    }
  } finally {
    isRunning = false;
  }

  return { skipped: null, results };
}

export function isBackupRunning(): boolean {
  return isRunning;
}

export function resetBackupRunnerForTests(): void {
  isRunning = false;
}
