/**
 * Telegram uploader for backup files.
 *
 * Builds the admin-internal HTML caption and posts the gzipped dump to
 * its dedicated topic in the existing event-log supergroup
 * (`LOG_GROUP_ID`). One topic per database — chosen by the caller.
 */
import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import type { Telegram } from 'telegraf';
import type { BackupDbName } from '../events/types';
import type { DumpResult } from './dump';

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const KB = 1024;

function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${String(bytes)} B`;
}

function formatUtc(d: Date): string {
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

export function buildCaption(
  db: BackupDbName,
  meta: DumpResult,
  now: Date = new Date(),
): string {
  return (
    `<b>🗄 backup · ${db}</b>\n` +
    `date: ${formatUtc(now)}\n` +
    `size: ${formatBytes(meta.sizeBytes)}\n` +
    `sha256: <code>${meta.sha256.slice(0, 16)}…</code>\n` +
    `duration: ${(meta.durationMs / 1000).toFixed(1)} s`
  );
}

export interface SendBackupOptions {
  telegram: Telegram;
  groupId: string;
  topicId: number;
  db: BackupDbName;
  filePath: string;
  meta: DumpResult;
  now?: Date;
}

export async function sendBackupToTelegram({
  telegram,
  groupId,
  topicId,
  db,
  filePath,
  meta,
  now,
}: SendBackupOptions): Promise<void> {
  const caption = buildCaption(db, meta, now);
  const filename = basename(filePath);
  await telegram.sendDocument(
    groupId,
    { source: createReadStream(filePath), filename },
    {
      caption,
      parse_mode: 'HTML',
      message_thread_id: topicId,
    },
  );
}
