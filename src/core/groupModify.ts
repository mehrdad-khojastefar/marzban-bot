import { Account, PrismaClient } from '@prisma/client';
import type { MarzbanClient } from './marzban/client';

const GB_BYTES = 1073741824;
const DAY_SECONDS = 86400;

export type GroupSelector =
  | { kind: 'prefix'; value: string }
  | { kind: 'seller'; sellerId: number }
  | { kind: 'user'; userChatId: bigint };

export interface Modifications {
  addGb?: number;
  addDays?: number;
  status?: 'active' | 'disabled';
  resetTraffic?: boolean;
}

export type AccountResult =
  | {
      ok: true;
      accountId: number;
      username: string;
      previousDataLimit: number | null;
      previousExpire: number | null;
      newDataLimit: number | null;
      newExpire: number | null;
    }
  | {
      ok: false;
      accountId: number;
      username: string;
      error: string;
    };

export interface BatchReport {
  total: number;
  succeeded: number;
  failed: number;
  results: AccountResult[];
}

// Narrow interface so tests can satisfy it with vi.fn() instead of mocking the full client.
type MarzbanLike = Pick<
  MarzbanClient,
  'getUser' | 'modifyUser' | 'resetUserDataUsage'
>;

export function hasAnyModification(mods: Modifications): boolean {
  return (
    mods.addGb !== undefined ||
    mods.addDays !== undefined ||
    mods.status !== undefined ||
    mods.resetTraffic === true
  );
}

export async function resolveAccounts(
  db: PrismaClient,
  selector: GroupSelector,
): Promise<Account[]> {
  if (selector.kind === 'prefix') {
    return db.account.findMany({
      where: { marzban_username: { startsWith: selector.value } },
      orderBy: { created_at: 'desc' },
    });
  }

  if (selector.kind === 'seller') {
    return db.account.findMany({
      where: { seller_id: selector.sellerId },
      orderBy: { created_at: 'desc' },
    });
  }

  const user = await db.user.findUnique({ where: { chat_id: selector.userChatId } });
  if (!user) return [];
  return db.account.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: 'desc' },
  });
}

export async function applyToAccount(
  db: PrismaClient,
  marzban: MarzbanLike,
  account: Account,
  mods: Modifications,
): Promise<AccountResult> {
  try {
    const marzbanUser = await marzban.getUser(account.marzban_username);

    const previousDataLimit = marzbanUser.data_limit ?? null;
    const previousExpire = marzbanUser.expire ?? null;

    const payload: {
      data_limit?: number;
      expire?: number;
      status?: 'active' | 'disabled';
    } = {};

    let newDataLimit: number | null = null;
    let newExpire: number | null = null;

    if (mods.addGb !== undefined && mods.addGb !== 0) {
      const current = marzbanUser.data_limit ?? 0;
      // Clamp to ≥1 so a too-large subtraction doesn't underflow to a
      // negative limit or land on 0 (which Marzban can interpret as "unlimited").
      newDataLimit = Math.max(1, current + mods.addGb * GB_BYTES);
      payload.data_limit = newDataLimit;
    }

    if (mods.addDays !== undefined && mods.addDays !== 0) {
      const nowSec = Math.floor(Date.now() / 1000);
      const current = marzbanUser.expire ?? nowSec;
      const base = Math.max(current, nowSec);
      newExpire = base + mods.addDays * DAY_SECONDS;
      payload.expire = newExpire;
    }

    if (mods.status !== undefined) {
      payload.status = mods.status;
    }

    if (Object.keys(payload).length > 0) {
      await marzban.modifyUser(account.marzban_username, payload);
    }

    if (mods.resetTraffic) {
      await marzban.resetUserDataUsage(account.marzban_username);
    }

    if (newExpire !== null) {
      await db.account.update({
        where: { id: account.id },
        data: { expires_at: new Date(newExpire * 1000) },
      });
    }

    return {
      ok: true,
      accountId: account.id,
      username: account.marzban_username,
      previousDataLimit,
      previousExpire,
      newDataLimit,
      newExpire,
    };
  } catch (err) {
    console.error(
      `groupModify failed for account ${String(account.id)} (${account.marzban_username}):`,
      err,
    );
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      accountId: account.id,
      username: account.marzban_username,
      error: message,
    };
  }
}

export async function executeBatch(
  db: PrismaClient,
  marzban: MarzbanLike,
  accounts: Account[],
  mods: Modifications,
  onProgress?: (done: number, total: number) => void | Promise<void>,
  concurrency = 5,
): Promise<BatchReport> {
  const results: AccountResult[] = new Array(accounts.length);
  let succeeded = 0;
  let failed = 0;
  let done = 0;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= accounts.length) return;
      const result = await applyToAccount(db, marzban, accounts[i], mods);
      results[i] = result;
      if (result.ok) succeeded++;
      else failed++;
      done++;
      if (onProgress) {
        await onProgress(done, accounts.length);
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, accounts.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    total: accounts.length,
    succeeded,
    failed,
    results,
  };
}
