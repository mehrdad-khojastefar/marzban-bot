import { PrismaClient } from '@prisma/client';
import { getMarzban, buildProxiesAndInbounds } from './marzban';
import { extractSubToken, buildSubUrl, fetchAndRenameConfigs, formatBytes, formatDaysLeft } from './utils/format';
import { loadEnv } from './utils/config';

function generateUsername(): string {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `dove_${rand}`;
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
 * Provision a Marzban VPN account for a completed transaction.
 *
 * This is the shared provisioning logic used by BOTH the manual approval handler
 * and the Premzy callback server. It:
 * 1. Creates the Marzban user
 * 2. Saves the Account record
 * 3. Links the account back to the Transaction
 * 4. Returns the result for notification
 *
 * Throws on failure — caller is responsible for updating transaction status.
 */
export async function provisionAccount(
  db: PrismaClient,
  req: ProvisionRequest,
): Promise<ProvisionResult> {
  const marzban = getMarzban();
  const marzbanUsername = generateUsername();

  const expireTimestamp =
    Math.floor(Date.now() / 1000) + req.durationDays * 24 * 60 * 60;

  const { proxies, inbounds } = await buildProxiesAndInbounds();

  const marzbanUser = await marzban.addUser({
    username: marzbanUsername,
    proxies,
    inbounds,
    data_limit: req.dataLimit,
    expire: expireTimestamp,
    status: 'active',
  });

  const subToken = extractSubToken(marzbanUser.subscription_url);
  const expiresAt = new Date(expireTimestamp * 1000);

  const account = await db.account.create({
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

  // Link account back to transaction
  await db.transaction.update({
    where: { id: req.transactionId },
    data: { account_id: account.id, status: 'completed' },
  });

  return { marzbanUsername, subToken, accountId: account.id, expiresAt };
}

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
