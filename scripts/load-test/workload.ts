/**
 * Synthetic DB workload runner.
 *
 * Exercises the hottest read paths (those touched by every Telegram update or
 * subscription request) against the cohort created by ./seed.ts and reports
 * p50 / p95 / p99 latency per operation type.
 *
 * Usage:
 *   tsx scripts/load-test/workload.ts                                          # defaults
 *   tsx scripts/load-test/workload.ts --concurrency 50 --duration 60          # 50 concurrent, 60 s
 *   tsx scripts/load-test/workload.ts --concurrency 100 --duration 120 --warmup 5
 *
 * Operations mixed (uniform):
 *   - user_by_chat_id       (channelCheck path / per-update lookup)
 *   - account_by_sub_token  (sub server path)
 *   - accounts_by_user      ("my accounts" scene)
 *   - seller_report_groupby (Step 5)
 *   - admin_unpaid_agg      (Step 5)
 *
 * Reads SLOs from WORKING.md: p95 < 300 ms on cached path, < 800 ms p99.
 * The workload runs *without* the application-level caches — it goes straight
 * to Prisma — so the numbers are a worst-case for what an uncached cold
 * shoulder query costs after Step 1's indexes.
 */
import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { createPrismaClient } from '../../src/core/db';

const COHORT_USERNAME_PREFIX = 'loadtest_';

interface Args {
  concurrency: number;
  durationSeconds: number;
  warmupSeconds: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { concurrency: 50, durationSeconds: 60, warmupSeconds: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--concurrency' && value) { args.concurrency = Number.parseInt(value, 10); i += 1; }
    else if (flag === '--duration' && value) { args.durationSeconds = Number.parseInt(value, 10); i += 1; }
    else if (flag === '--warmup' && value) { args.warmupSeconds = Number.parseInt(value, 10); i += 1; }
  }
  return args;
}

type OpName =
  | 'user_by_chat_id'
  | 'account_by_sub_token'
  | 'accounts_by_user'
  | 'seller_report_groupby'
  | 'admin_unpaid_agg';

const ALL_OPS: OpName[] = [
  'user_by_chat_id',
  'account_by_sub_token',
  'accounts_by_user',
  'seller_report_groupby',
  'admin_unpaid_agg',
];

interface SampleBag {
  count: number;
  errors: number;
  samples: number[];      // ms
}

function makeBag(): SampleBag {
  return { count: 0, errors: 0, samples: [] };
}

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(q * sortedAsc.length));
  return sortedAsc[idx];
}

interface OpContext {
  chatIds: bigint[];
  subTokens: string[];
  userIds: number[];
  sellerIds: number[];
}

type Operation = (ctx: OpContext, db: ReturnType<typeof createPrismaClient>) => Promise<unknown>;

const OPERATIONS: Record<OpName, Operation> = {
  user_by_chat_id: async (ctx, db) => {
    const chat = ctx.chatIds[Math.floor(Math.random() * ctx.chatIds.length)];
    return db.user.findUnique({
      where: { chat_id: chat },
      select: { id: true, status: true, has_test: true },
    });
  },
  account_by_sub_token: async (ctx, db) => {
    const token = ctx.subTokens[Math.floor(Math.random() * ctx.subTokens.length)];
    return db.account.findFirst({
      where: { marzban_sub_token: token },
      select: {
        marzban_username: true,
        display_name: true,
        seller: { select: { link_prefix: true } },
      },
    });
  },
  accounts_by_user: async (ctx, db) => {
    const uid = ctx.userIds[Math.floor(Math.random() * ctx.userIds.length)];
    return db.account.findMany({
      where: { user_id: uid },
      select: { id: true, marzban_username: true, expires_at: true, payment_status: true },
      take: 50,
    });
  },
  seller_report_groupby: async (ctx, db) => {
    const sellerId = ctx.sellerIds.length === 0
      ? null
      : ctx.sellerIds[Math.floor(Math.random() * ctx.sellerIds.length)];
    if (sellerId === null) {
      return db.account.groupBy({
        by: ['payment_status'],
        _sum: { price: true },
        _count: { _all: true },
      });
    }
    return db.account.groupBy({
      by: ['payment_status'],
      where: { seller_id: sellerId },
      _sum: { price: true },
      _count: { _all: true },
    });
  },
  admin_unpaid_agg: async (_ctx, db) => {
    return db.account.aggregate({
      where: { payment_status: 'unpaid' },
      _count: { _all: true },
      _sum: { price: true },
    });
  },
};

async function loadCohort(db: ReturnType<typeof createPrismaClient>): Promise<OpContext> {
  console.log('[workload] loading cohort address space…');
  const accounts = await db.account.findMany({
    where: { marzban_username: { startsWith: COHORT_USERNAME_PREFIX } },
    select: {
      user: { select: { id: true, chat_id: true } },
      marzban_sub_token: true,
      seller_id: true,
    },
    take: 50_000,
  });
  if (accounts.length === 0) {
    throw new Error('[workload] cohort is empty — run scripts/load-test/seed.ts first.');
  }
  const chatIds: bigint[] = [];
  const subTokens: string[] = [];
  const userIds: number[] = [];
  const sellerIdSet = new Set<number>();
  for (const a of accounts) {
    if (a.user) {
      chatIds.push(a.user.chat_id);
      userIds.push(a.user.id);
    }
    if (a.marzban_sub_token) subTokens.push(a.marzban_sub_token);
    if (a.seller_id !== null) sellerIdSet.add(a.seller_id);
  }
  console.log(
    `[workload] cohort: ${chatIds.length} users, ${subTokens.length} sub tokens, ${sellerIdSet.size} sellers`,
  );
  return { chatIds, subTokens, userIds, sellerIds: [...sellerIdSet] };
}

async function worker(
  db: ReturnType<typeof createPrismaClient>,
  ctx: OpContext,
  results: Record<OpName, SampleBag>,
  stopAt: number,
): Promise<void> {
  while (performance.now() < stopAt) {
    const op = ALL_OPS[Math.floor(Math.random() * ALL_OPS.length)];
    const bag = results[op];
    const startedAt = performance.now();
    try {
      await OPERATIONS[op](ctx, db);
      const ms = performance.now() - startedAt;
      bag.count += 1;
      bag.samples.push(ms);
    } catch (err) {
      bag.errors += 1;
      if (bag.errors === 1) {
        console.error(`[workload] first error for ${op}:`, err);
      }
    }
  }
}

function summarise(name: string, bag: SampleBag): string {
  if (bag.samples.length === 0) {
    return `${name.padEnd(24)} no samples (errors=${bag.errors})`;
  }
  const sorted = [...bag.samples].sort((a, b) => a - b);
  const p50 = quantile(sorted, 0.5);
  const p95 = quantile(sorted, 0.95);
  const p99 = quantile(sorted, 0.99);
  const max = sorted[sorted.length - 1];
  return [
    name.padEnd(24),
    `count=${String(bag.count).padStart(6)}`,
    `err=${String(bag.errors).padStart(3)}`,
    `p50=${p50.toFixed(1)}ms`,
    `p95=${p95.toFixed(1)}ms`,
    `p99=${p99.toFixed(1)}ms`,
    `max=${max.toFixed(1)}ms`,
  ].join(' ');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[workload] concurrency=${args.concurrency} duration=${args.durationSeconds}s warmup=${args.warmupSeconds}s`,
  );

  const db = createPrismaClient({ source: 'loadtest-workload' });
  const ctx = await loadCohort(db);

  // Warmup — discard these samples; lets the pool, indexes, and OS pages settle.
  console.log(`[workload] warmup for ${args.warmupSeconds}s…`);
  const warmupResults: Record<OpName, SampleBag> = Object.fromEntries(
    ALL_OPS.map((op) => [op, makeBag()]),
  ) as Record<OpName, SampleBag>;
  const warmupEnd = performance.now() + args.warmupSeconds * 1000;
  await Promise.all(
    Array.from({ length: args.concurrency }, () => worker(db, ctx, warmupResults, warmupEnd)),
  );

  console.log(`[workload] running for ${args.durationSeconds}s…`);
  const results: Record<OpName, SampleBag> = Object.fromEntries(
    ALL_OPS.map((op) => [op, makeBag()]),
  ) as Record<OpName, SampleBag>;
  const startedAt = performance.now();
  const stopAt = startedAt + args.durationSeconds * 1000;
  await Promise.all(
    Array.from({ length: args.concurrency }, () => worker(db, ctx, results, stopAt)),
  );
  const elapsedSec = (performance.now() - startedAt) / 1000;

  const totalCount = ALL_OPS.reduce((sum, op) => sum + results[op].count, 0);
  const totalErrors = ALL_OPS.reduce((sum, op) => sum + results[op].errors, 0);
  console.log('');
  console.log('────────────────────────────────────────────────────────────────────────');
  console.log(`[workload] elapsed=${elapsedSec.toFixed(1)}s ops=${totalCount} errors=${totalErrors} throughput=${(totalCount / elapsedSec).toFixed(1)}/s`);
  console.log('────────────────────────────────────────────────────────────────────────');
  for (const op of ALL_OPS) {
    console.log(summarise(op, results[op]));
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error('[workload] failed:', err);
  process.exit(1);
});
