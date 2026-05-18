import { PrismaClient, TransactionStatus } from '@prisma/client';
import { getMarzban, buildProxiesAndInbounds } from './marzban';
import { extractSubToken, buildSubUrl, fetchAndRenameConfigs, formatBytes, formatDaysLeft } from './utils/format';
import { loadEnv } from './utils/config';

function generateUsername(): string {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `dove_${rand}`;
}

// Statuses from which a Transaction can be safely claimed for provisioning.
// Excludes anything in flight (`provisioning`) and terminal (`completed`,
// `rejected`, `cancelled`, `expired`). `failed` is intentionally included:
// with the new atomic design, a failed transaction never has an Account row
// linked to it, so a retry is safe (a fresh Marzban username is generated;
// any leftover Marzban user from the prior attempt is best-effort cleaned).
const CLAIMABLE_STATUSES: TransactionStatus[] = [
  'pending',
  'paid',
  'awaiting_approval',
  'checkout',
  'failed',
];

/**
 * Thrown when a caller asks provisionAccount / renewAccount to process a
 * transaction that cannot be claimed (in flight, rejected, cancelled, etc.).
 * The handler can use this to render a "already processed" UI instead of an
 * error.
 */
export class ProvisionConflictError extends Error {
  constructor(
    public readonly transactionId: number,
    public readonly currentStatus: string,
  ) {
    super(
      `Transaction ${transactionId} cannot be claimed for provisioning; status=${currentStatus}`,
    );
    this.name = 'ProvisionConflictError';
  }
}

export type ClaimOutcome =
  | { kind: 'claimed' }
  | { kind: 'already_completed'; accountId: number };

/**
 * Atomically flip a Transaction to `provisioning` if it's in a claimable
 * state. Single-statement compare-and-set — safe under concurrency.
 *
 * Returns:
 *  - `{ kind: 'claimed' }` — caller now owns the transaction; proceed.
 *  - `{ kind: 'already_completed', accountId }` — provisioning is done;
 *    caller can return the existing result (idempotent).
 *  - throws `ProvisionConflictError` for any other state.
 */
export async function claimTransactionForProvisioning(
  db: PrismaClient,
  transactionId: number,
): Promise<ClaimOutcome> {
  const result = await db.transaction.updateMany({
    where: {
      id: transactionId,
      status: { in: CLAIMABLE_STATUSES },
    },
    data: { status: 'provisioning' },
  });

  if (result.count === 1) {
    return { kind: 'claimed' };
  }

  const tx = await db.transaction.findUnique({
    where: { id: transactionId },
    select: { status: true, account_id: true },
  });
  if (!tx) {
    throw new Error(`Transaction ${transactionId} not found`);
  }
  if (tx.status === 'completed' && tx.account_id) {
    return { kind: 'already_completed', accountId: tx.account_id };
  }
  throw new ProvisionConflictError(transactionId, tx.status);
}

/**
 * Best-effort mark a transaction as `failed` with the error message. Used to
 * surface partial-failure state to admins. Failures here are swallowed and
 * logged because the original error has already been propagated.
 */
export async function markTransactionFailed(
  db: PrismaClient,
  transactionId: number,
  err: unknown,
): Promise<void> {
  try {
    await db.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'failed',
        error_message: err instanceof Error ? err.message : String(err),
      },
    });
  } catch (updateErr) {
    console.error(
      `Failed to mark transaction ${transactionId} as failed:`,
      updateErr,
    );
  }
}

export interface ProvisionRequest {
  transactionId: number;
  userId: number;
  planId: number | null;
  dataLimit: number;      // bytes
  durationDays: number;
  amount: number;          // toman
}

export interface ProvisionResult {
  marzbanUsername: string;
  subToken: string;
  accountId: number;
  expiresAt: Date;
}

/**
 * Provision a Marzban VPN account for a transaction.
 *
 * Lifecycle:
 *   1. Atomically claim the transaction (flip to `provisioning`).
 *      Throws ProvisionConflictError if it cannot be claimed.
 *      Returns the existing result if the transaction is already completed.
 *   2. Call Marzban to create the user (outside any DB transaction).
 *      On failure: mark transaction `failed`, rethrow.
 *   3. In a single DB transaction, create the Account and mark the
 *      Transaction `completed`. On failure: best-effort cleanup of the
 *      orphan Marzban user, mark transaction `failed`, rethrow.
 */
export async function provisionAccount(
  db: PrismaClient,
  req: ProvisionRequest,
): Promise<ProvisionResult> {
  const claim = await claimTransactionForProvisioning(db, req.transactionId);
  if (claim.kind === 'already_completed') {
    const account = await db.account.findUnique({
      where: { id: claim.accountId },
      select: {
        id: true,
        marzban_username: true,
        marzban_sub_token: true,
        expires_at: true,
      },
    });
    if (!account) {
      throw new Error(
        `Transaction ${req.transactionId} completed but account ${claim.accountId} missing`,
      );
    }
    return {
      marzbanUsername: account.marzban_username,
      subToken: account.marzban_sub_token ?? '',
      accountId: account.id,
      expiresAt: account.expires_at,
    };
  }

  const marzban = getMarzban();
  const marzbanUsername = generateUsername();
  const expireTimestamp =
    Math.floor(Date.now() / 1000) + req.durationDays * 24 * 60 * 60;
  const { proxies, inbounds } = await buildProxiesAndInbounds();

  let marzbanUser;
  try {
    marzbanUser = await marzban.addUser({
      username: marzbanUsername,
      proxies,
      inbounds,
      data_limit: req.dataLimit,
      expire: expireTimestamp,
      status: 'active',
    });
  } catch (err) {
    await markTransactionFailed(db, req.transactionId, err);
    throw err;
  }

  const subToken = extractSubToken(marzbanUser.subscription_url);
  const expiresAt = new Date(expireTimestamp * 1000);

  let account;
  try {
    account = await db.$transaction(async (tx) => {
      const created = await tx.account.create({
        data: {
          user_id: req.userId,
          plan_id: req.planId,
          marzban_username: marzbanUsername,
          marzban_sub_token: subToken,
          type: 'paid',
          payment_status: 'paid',
          price: req.amount,
          expires_at: expiresAt,
        },
      });
      await tx.transaction.update({
        where: { id: req.transactionId },
        data: { account_id: created.id, status: 'completed' },
      });
      return created;
    });
  } catch (err) {
    // The Marzban user exists but our DB write failed. Best-effort cleanup
    // so we don't leak an orphan; if removal also fails the operator will
    // need to reconcile manually (the error_message points them at it).
    try {
      await marzban.removeUser(marzbanUsername);
    } catch (cleanupErr) {
      console.error(
        `Failed to clean up orphan Marzban user ${marzbanUsername}:`,
        cleanupErr,
      );
    }
    await markTransactionFailed(db, req.transactionId, err);
    throw err;
  }

  return { marzbanUsername, subToken, accountId: account.id, expiresAt };
}

// ── Renew ────────────────────────────────────────────────────────

export interface RenewRequest {
  transactionId: number;
  accountId: number;
  dataLimitToAdd: number;  // bytes to ADD to current limit
  durationDays: number;
}

export interface RenewResult {
  marzbanUsername: string;
  newDataLimit: number;    // bytes — the new total after addition
  newExpiresAt: Date;
  accountId: number;
}

/**
 * Renew an existing Marzban VPN account.
 *
 * Lifecycle mirrors provisionAccount:
 *   1. Atomically claim the transaction. If already completed, return the
 *      current account state (best-effort live read from Marzban).
 *   2. Read current Marzban state, compute new limit / expiry, and call
 *      Marzban.modifyUser (outside any DB transaction). On failure: mark
 *      transaction `failed`, rethrow.
 *   3. In a single DB transaction, update the Account and mark the
 *      Transaction `completed`. On DB-write failure: mark transaction
 *      `failed` and rethrow (the Marzban side is already updated; the
 *      operator must reconcile from the error_message).
 *
 * Fair accumulation logic (preserved from the original implementation):
 *   - Data limit: current Marzban data_limit + requested data
 *   - Expiry: max(current_expire, now) + duration_days
 *   - Reactivates expired / limited / disabled accounts
 *   - Does NOT reset data usage
 */
export async function renewAccount(
  db: PrismaClient,
  req: RenewRequest,
): Promise<RenewResult> {
  const claim = await claimTransactionForProvisioning(db, req.transactionId);
  if (claim.kind === 'already_completed') {
    const account = await db.account.findUnique({
      where: { id: req.accountId },
      select: { id: true, marzban_username: true, expires_at: true },
    });
    if (!account) {
      throw new Error(
        `Transaction ${req.transactionId} completed but account ${req.accountId} missing`,
      );
    }
    // Report the current live limit if Marzban responds; otherwise zero.
    let liveDataLimit = 0;
    try {
      const live = await getMarzban().getUser(account.marzban_username);
      liveDataLimit = live.data_limit ?? 0;
    } catch {
      // best effort
    }
    return {
      marzbanUsername: account.marzban_username,
      newDataLimit: liveDataLimit,
      newExpiresAt: account.expires_at,
      accountId: account.id,
    };
  }

  const marzban = getMarzban();

  // Account is needed for its marzban_username only — slim select.
  const account = await db.account.findUnique({
    where: { id: req.accountId },
    select: { marzban_username: true },
  });
  if (!account) {
    const notFound = new Error(`Account ${req.accountId} not found`);
    await markTransactionFailed(db, req.transactionId, notFound);
    throw notFound;
  }

  let marzbanUser;
  try {
    marzbanUser = await marzban.getUser(account.marzban_username);
  } catch (err) {
    await markTransactionFailed(db, req.transactionId, err);
    throw err;
  }

  const currentDataLimit = marzbanUser.data_limit ?? 0;
  const newDataLimit = currentDataLimit + req.dataLimitToAdd;

  const nowTimestamp = Math.floor(Date.now() / 1000);
  const currentExpire = marzbanUser.expire ?? nowTimestamp;
  const baseExpire = Math.max(currentExpire, nowTimestamp);
  const newExpireTimestamp = baseExpire + req.durationDays * 24 * 60 * 60;
  const newExpiresAt = new Date(newExpireTimestamp * 1000);

  try {
    await marzban.modifyUser(account.marzban_username, {
      data_limit: newDataLimit,
      expire: newExpireTimestamp,
      status: 'active',
    });
  } catch (err) {
    await markTransactionFailed(db, req.transactionId, err);
    throw err;
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: req.accountId },
        data: { expires_at: newExpiresAt },
      });
      await tx.transaction.update({
        where: { id: req.transactionId },
        data: { account_id: req.accountId, status: 'completed' },
      });
    });
  } catch (err) {
    // Marzban was already modified successfully; DB write failed. Mark the
    // transaction failed so an operator notices the divergence.
    await markTransactionFailed(db, req.transactionId, err);
    throw err;
  }

  return {
    marzbanUsername: account.marzban_username,
    newDataLimit,
    newExpiresAt,
    accountId: req.accountId,
  };
}

/**
 * Build the user notification message after account renewal.
 */
export function buildRenewNotification(
  result: RenewResult,
): string {
  return (
    `✅ اکانت شما با موفقیت تمدید شد!\n\n` +
    `📛 نام: ${result.marzbanUsername}\n` +
    `📦 حجم جدید: ${formatBytes(result.newDataLimit)}\n` +
    `⏰ انقضای جدید: ${formatDaysLeft(result.newExpiresAt)}`
  );
}

// ── Buy notification ─────────────────────────────────────────────

/**
 * Build the user notification message after account provisioning.
 */
export function buildAccountNotification(
  result: ProvisionResult,
  dataLimit: number,
  planLabel: string,
): string {
  return (
    `✅ اکانت شما ساخته شد!\n\n` +
    `📛 نام: ${result.marzbanUsername}\n` +
    `📦 حجم: ${formatBytes(dataLimit)}\n` +
    `⏰ انقضا: ${formatDaysLeft(result.expiresAt)}\n` +
    `📋 پلن: ${planLabel}`
  );
}

/**
 * Build the full notification message with subscription link and configs.
 */
export async function buildFullAccountNotification(
  result: ProvisionResult,
  dataLimit: number,
  planLabel: string,
): Promise<string> {
  const env = loadEnv();
  let msg = buildAccountNotification(result, dataLimit, planLabel);

  if (result.subToken) {
    const subUrl = buildSubUrl(env.SUB_BASE_URL, `/sub/${result.subToken}`);
    const linkPrefix = env.CONFIG_LINK_PREFIX;
    const configs = await fetchAndRenameConfigs(
      env.MARZBAN_SUB_URL,
      result.subToken,
      linkPrefix,
      result.marzbanUsername,
    );
    msg += `\n\n🔗 لینک اشتراک:\n<pre>${subUrl}</pre>`;
    if (configs.length > 0) {
      msg += `\n📋 کانفیگ‌ها:`;
      for (const config of configs) {
        msg += `\n<pre>${config}</pre>`;
      }
    }
  }

  return msg;
}
