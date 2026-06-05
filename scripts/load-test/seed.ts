/**
 * Synthetic load-test seeder.
 *
 * Bulk-creates a fixed cohort of users + accounts so the workload script
 * (./workload.ts) has a known address space to query against. Idempotent on
 * the cohort tag: rows already tagged with the prefix are skipped.
 *
 * Usage:
 *   tsx scripts/load-test/seed.ts                  # defaults: 10_000 users + 10_000 accounts
 *   tsx scripts/load-test/seed.ts --users 5000     # custom user count
 *   tsx scripts/load-test/seed.ts --accounts 5000  # custom account count
 *   tsx scripts/load-test/seed.ts --reset          # delete prior cohort first
 *
 * Cohort tagging:
 *   - users.chat_id starts at LOAD_TEST_CHAT_ID_BASE (1_000_000_000_000).
 *   - accounts.marzban_username starts with `loadtest_`.
 *   - users.first_name === 'LoadTest' so we can find/wipe them quickly.
 */
import 'dotenv/config';
import { createPrismaClient } from '../../src/core/db';

const LOAD_TEST_CHAT_ID_BASE = 1_000_000_000_000n;
const COHORT_FIRST_NAME = 'LoadTest';
const COHORT_USERNAME_PREFIX = 'loadtest_';

interface Args {
  users: number;
  accounts: number;
  reset: boolean;
  batch: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { users: 10_000, accounts: 10_000, reset: false, batch: 500 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--users' && value) { args.users = Number.parseInt(value, 10); i += 1; }
    else if (flag === '--accounts' && value) { args.accounts = Number.parseInt(value, 10); i += 1; }
    else if (flag === '--batch' && value) { args.batch = Number.parseInt(value, 10); i += 1; }
    else if (flag === '--reset') { args.reset = true; }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[seed] cohort: users=${args.users} accounts=${args.accounts} batch=${args.batch} reset=${args.reset}`);

  const db = createPrismaClient({ source: 'loadtest-seed' });

  if (args.reset) {
    console.log('[seed] resetting prior cohort…');
    const acc = await db.account.deleteMany({
      where: { marzban_username: { startsWith: COHORT_USERNAME_PREFIX } },
    });
    const users = await db.user.deleteMany({ where: { first_name: COHORT_FIRST_NAME } });
    console.log(`[seed] reset: accounts=${acc.count} users=${users.count}`);
  }

  // Users — createMany skipDuplicates handles re-runs cleanly.
  const userStart = Date.now();
  let usersCreated = 0;
  for (let i = 0; i < args.users; i += args.batch) {
    const chunk = Math.min(args.batch, args.users - i);
    const rows = Array.from({ length: chunk }, (_, k) => ({
      chat_id: LOAD_TEST_CHAT_ID_BASE + BigInt(i + k),
      first_name: COHORT_FIRST_NAME,
      status: 'approved' as const,
    }));
    const result = await db.user.createMany({ data: rows, skipDuplicates: true });
    usersCreated += result.count;
    if ((i + chunk) % (args.batch * 10) === 0) {
      process.stdout.write(`  users ${i + chunk}/${args.users}\r`);
    }
  }
  console.log(`[seed] users: created=${usersCreated} in ${Date.now() - userStart}ms`);

  // Accounts — one per user up to args.accounts. We map account i → user i.
  // Look up the user id range we just (re-)created to avoid hard-coding ids.
  const firstUser = await db.user.findFirst({
    where: { chat_id: LOAD_TEST_CHAT_ID_BASE },
    select: { id: true },
  });
  if (!firstUser) throw new Error('[seed] base user not found — did the createMany silently skip?');

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const accStart = Date.now();
  let accountsCreated = 0;
  for (let i = 0; i < args.accounts; i += args.batch) {
    const chunk = Math.min(args.batch, args.accounts - i);
    const rows = Array.from({ length: chunk }, (_, k) => {
      const idx = i + k;
      return {
        user_id: firstUser.id + idx,
        marzban_username: `${COHORT_USERNAME_PREFIX}${String(idx).padStart(7, '0')}`,
        marzban_sub_token: `tok_${idx.toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
        type: 'paid' as const,
        payment_status: idx % 3 === 0 ? ('unpaid' as const) : ('paid' as const),
        price: 50_000 + (idx % 10) * 10_000,
        expires_at: expiresAt,
      };
    });
    const result = await db.account.createMany({ data: rows, skipDuplicates: true });
    accountsCreated += result.count;
    if ((i + chunk) % (args.batch * 10) === 0) {
      process.stdout.write(`  accounts ${i + chunk}/${args.accounts}\r`);
    }
  }
  console.log(`[seed] accounts: created=${accountsCreated} in ${Date.now() - accStart}ms`);

  await db.$disconnect();
  console.log('[seed] done.');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
