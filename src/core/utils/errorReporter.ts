import { inspect } from 'node:util';
import type { Telegram } from 'telegraf';

export type ErrorSource = 'bot' | 'sub' | 'premzy' | 'process';

export interface ErrorContext {
  source?: ErrorSource;
  [key: string]: unknown;
}

interface ReporterState {
  telegram: Telegram;
  chatId: string;
  env: string;
  enabled: boolean;
}

interface DedupeEntry {
  count: number;
  firstSeenAt: number;
  timer: NodeJS.Timeout;
}

const TELEGRAM_MAX = 4096;
const CHUNK_BUDGET = 3800;
const DEDUPE_TTL_MS = 60_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const MAX_CAUSE_DEPTH = 5;

let state: ReporterState | null = null;
const dedupe = new Map<string, DedupeEntry>();
let rateWindowStart = Date.now();
let rateCount = 0;
let rateDropped = 0;

export function initErrorReporter(opts: {
  telegram: Telegram;
  chatId: string | undefined;
  env: string;
  enabled?: boolean;
}): void {
  if (!opts.chatId) {
    console.warn('[errorReporter] ERROR_CHAT_ID not set — error reporting disabled');
    state = null;
    return;
  }
  if (opts.enabled === false) {
    console.warn('[errorReporter] ERROR_REPORTING_ENABLED=false — error reporting disabled');
    state = null;
    return;
  }
  state = {
    telegram: opts.telegram,
    chatId: opts.chatId,
    env: opts.env || 'development',
    enabled: true,
  };
  console.log(`[errorReporter] initialized for chat ${opts.chatId} (env=${state.env})`);
}

export function isErrorReporterEnabled(): boolean {
  return state !== null;
}

/**
 * Report an error to the configured Telegram group.
 * This function MUST never throw — failures are logged to console only.
 */
export async function reportError(err: unknown, context: ErrorContext = {}): Promise<void> {
  try {
    if (!state) return;

    if (!withinRateLimit()) {
      rateDropped += 1;
      if (rateDropped === 1) {
        console.warn(
          '[errorReporter] rate limit hit (30/min) — dropping further reports this window',
        );
      }
      return;
    }

    const key = dedupeKey(err);
    const existing = dedupe.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }

    const timer = setTimeout(() => {
      const entry = dedupe.get(key);
      dedupe.delete(key);
      if (entry && entry.count > 1) {
        void sendSuppressionSummary(key, entry.count - 1).catch(() => {
          // Already isolated by sendSuppressionSummary
        });
      }
    }, DEDUPE_TTL_MS);
    if (typeof timer.unref === 'function') timer.unref();

    dedupe.set(key, { count: 1, firstSeenAt: Date.now(), timer });

    const payload = formatPayload(err, context, state.env);
    await sendChunks(payload);
  } catch (reporterErr) {
    console.error('[errorReporter] failed to report:', reporterErr);
  }
}

/**
 * Register process-level handlers that report and CONTINUE running.
 * Overrides Node's default-exit-on-uncaughtException behavior.
 */
export function registerProcessHandlers(source: Exclude<ErrorSource, 'process'>): void {
  process.on('uncaughtException', (err) => {
    console.error(`[${source}] uncaughtException:`, err);
    void reportError(err, { source: 'process', origin: source, kind: 'uncaughtException' });
  });
  process.on('unhandledRejection', (reason) => {
    console.error(`[${source}] unhandledRejection:`, reason);
    void reportError(reason, { source: 'process', origin: source, kind: 'unhandledRejection' });
  });
}

function withinRateLimit(): boolean {
  const now = Date.now();
  if (now - rateWindowStart >= RATE_WINDOW_MS) {
    rateWindowStart = now;
    rateCount = 0;
    rateDropped = 0;
  }
  if (rateCount >= RATE_MAX) return false;
  rateCount += 1;
  return true;
}

function dedupeKey(err: unknown): string {
  if (err instanceof Error) {
    const stack = err.stack ?? '';
    const firstFrame = stack.split('\n').find((l) => l.trim().startsWith('at ')) ?? '';
    return `${err.name}|${firstFrame.trim()}`;
  }
  return `non-error|${String(err).slice(0, 200)}`;
}

function formatPayload(err: unknown, context: ErrorContext, env: string): string {
  const source = (context.source ?? 'bot') as ErrorSource;
  const { source: _omit, ...rest } = context;
  void _omit;

  const header = buildHeader(err, source, env);
  const ctxBlock = buildContextBlock(rest);
  const stackBlock = buildStackBlock(err);
  const causeBlock = buildCauseBlock(err);

  const parts = [header];
  if (ctxBlock) parts.push('', ctxBlock);
  if (stackBlock) parts.push('', stackBlock);
  if (causeBlock) parts.push('', causeBlock);
  return parts.join('\n');
}

function buildHeader(err: unknown, source: ErrorSource, env: string): string {
  if (err instanceof Error) {
    return `🚨 [${env}] ${source}: ${err.name}: ${err.message}`;
  }
  return `🚨 [${env}] ${source}: non-Error thrown: ${truncate(String(err), 200)}`;
}

function buildContextBlock(ctx: Record<string, unknown>): string {
  const keys = Object.keys(ctx);
  if (keys.length === 0) return '';
  const lines = keys.map((k) => `  ${k}: ${stringifyContextValue(ctx[k])}`);
  return ['context:', ...lines].join('\n');
}

function stringifyContextValue(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  try {
    return inspect(v, { depth: 2, breakLength: 120 });
  } catch {
    return '[unserializable]';
  }
}

function buildStackBlock(err: unknown): string {
  if (err instanceof Error && err.stack) {
    return `stack:\n${err.stack}`;
  }
  return `value:\n${inspect(err, { depth: 3 })}`;
}

function buildCauseBlock(err: unknown): string {
  const causes: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < MAX_CAUSE_DEPTH; i++) {
    if (!(cur instanceof Error) || cur.cause === undefined || cur.cause === null) break;
    cur = cur.cause;
    if (cur instanceof Error) {
      causes.push(`${cur.name}: ${cur.message}${cur.stack ? `\n${cur.stack}` : ''}`);
    } else {
      causes.push(inspect(cur, { depth: 2 }));
    }
  }
  if (causes.length === 0) return '';
  return ['cause:', ...causes.map((c) => indent(c, '  '))].join('\n');
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((l) => prefix + l)
    .join('\n');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function chunkPayload(payload: string, budget = CHUNK_BUDGET): string[] {
  if (payload.length <= budget) return [payload];
  const chunks: string[] = [];
  let remaining = payload;
  while (remaining.length > budget) {
    let cut = remaining.lastIndexOf('\n', budget);
    if (cut < budget / 2) cut = budget;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, '');
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

async function sendChunks(payload: string): Promise<void> {
  if (!state) return;
  const chunks = chunkPayload(payload);
  const total = chunks.length;
  for (let i = 0; i < total; i++) {
    const tag = total > 1 ? `(${i + 1}/${total})\n` : '';
    const body = `<pre>${escapeHtml(tag + chunks[i])}</pre>`;
    const final =
      body.length > TELEGRAM_MAX ? body.slice(0, TELEGRAM_MAX - 16) + '…[truncated]</pre>' : body;
    try {
      await state.telegram.sendMessage(state.chatId, final, { parse_mode: 'HTML' });
    } catch (sendErr) {
      console.error('[errorReporter] sendMessage failed:', sendErr);
      return;
    }
  }
}

async function sendSuppressionSummary(key: string, suppressed: number): Promise<void> {
  if (!state || suppressed <= 0) return;
  const text = `🔁 [${state.env}] ${suppressed} duplicate error(s) suppressed in last 60s\nkey: ${truncate(key, 200)}`;
  try {
    await state.telegram.sendMessage(state.chatId, `<pre>${escapeHtml(text)}</pre>`, {
      parse_mode: 'HTML',
    });
  } catch (sendErr) {
    console.error('[errorReporter] suppression summary failed:', sendErr);
  }
}

/** Test-only — reset internal state between tests. */
export function __resetErrorReporterForTests(): void {
  for (const entry of dedupe.values()) clearTimeout(entry.timer);
  dedupe.clear();
  rateWindowStart = Date.now();
  rateCount = 0;
  rateDropped = 0;
  state = null;
}
