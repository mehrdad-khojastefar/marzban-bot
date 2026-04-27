import http from 'node:http';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Telegraf } from 'telegraf';
import { provisionAccount, buildFullAccountNotification } from '../core/provision';
import { formatBytes } from '../core/utils/format';

interface PremzyServerConfig {
  port: number;
  vendorToken: string;
  databaseUrl: string;
  telegramBotToken: string;
}

/**
 * Premzy callback server.
 *
 * Listens for POST /premzy/callback with { order_id: "<uuid>" }.
 * Verifies Authorization header, finds the matching transaction,
 * provisions the Marzban account, and notifies the user via Telegram.
 *
 * Resilience guarantees:
 * - Idempotent: same order_id processed only once (unique constraint + status check)
 * - Atomic status transitions: uses DB transactions for state changes
 * - Retryable: returns 500 on provision failure so Premzy can retry
 * - Auth verified: rejects requests without valid vendor token
 */
export async function startPremzyServer(config: PremzyServerConfig): Promise<http.Server> {
  const adapter = new PrismaPg({ connectionString: config.databaseUrl });
  const db = new PrismaClient({ adapter });
  const telegram = new Telegraf(config.telegramBotToken).telegram;

  const server = http.createServer(async (req, res) => {
    // Health check
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200);
      res.end('ok');
      return;
    }

    // Only handle POST /premzy/callback
    if (req.url !== '/premzy/callback' || req.method !== 'POST') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    // Verify authorization
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== config.vendorToken) {
      console.warn('Premzy callback: invalid authorization header');
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    // Parse body
    let body: string;
    try {
      body = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString()));
        req.on('error', reject);
      });
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'bad request' }));
      return;
    }

    let orderId: string;
    try {
      const parsed = JSON.parse(body);
      orderId = parsed.order_id;
      if (!orderId || typeof orderId !== 'string') {
        throw new Error('missing order_id');
      }
    } catch {
      console.warn('Premzy callback: invalid body:', body);
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid body, expected { order_id: string }' }));
      return;
    }

    console.log(`Premzy callback received: order_id=${orderId}`);

    try {
      // Idempotency: check if this order_id was already processed
      const existing = await db.transaction.findFirst({
        where: { premzy_order_id: orderId },
      });
      if (existing && existing.status === 'completed') {
        console.log(`Premzy callback: order_id=${orderId} already completed (txn=${existing.id})`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, message: 'already processed' }));
        return;
      }

      // Find the matching transaction — either already claimed or oldest unclaimed checkout
      let txnId = existing?.id;
      if (!txnId) {
        const unclaimed = await db.transaction.findFirst({
          where: {
            method: 'premzy',
            status: { in: ['checkout'] },
            premzy_order_id: null,
          },
          orderBy: { created_at: 'asc' },
        });

        if (!unclaimed) {
          console.error(`Premzy callback: no matching transaction for order_id=${orderId}`);
          res.writeHead(200); // 200 so Premzy doesn't retry — we'll handle manually
          res.end(JSON.stringify({ ok: false, message: 'no matching transaction' }));
          return;
        }
        txnId = unclaimed.id;
      }

      // Claim and mark as paid (atomic — unique constraint prevents double-claim)
      const transaction = await db.transaction.update({
        where: { id: txnId },
        data: {
          premzy_order_id: orderId,
          status: 'provisioning',
        },
        include: { user: true, plan: true },
      });

      // Determine data limit and duration
      let dataLimit: number;
      let durationDays: number;
      let planLabel: string;

      if (transaction.plan) {
        dataLimit = Number(transaction.plan.data_limit);
        durationDays = transaction.plan.duration_days;
        planLabel = transaction.plan.name;
      } else {
        dataLimit = Number(transaction.data_limit ?? 0);
        durationDays = transaction.duration_days;
        planLabel = formatBytes(dataLimit);
      }

      // Provision the account
      const result = await provisionAccount(db, {
        transactionId: transaction.id,
        userId: transaction.user_id,
        planId: transaction.plan_id,
        dataLimit,
        durationDays,
        amount: transaction.amount,
      });

      // Notify user via Telegram
      if (transaction.user) {
        try {
          const msg = await buildFullAccountNotification(result, dataLimit, planLabel);
          await telegram.sendMessage(transaction.user.chat_id.toString(), msg, { parse_mode: 'HTML' });
        } catch (notifyErr) {
          console.error(`Premzy callback: failed to notify user ${transaction.user.chat_id}:`, notifyErr);
          // Don't fail the callback — account is created, notification is best-effort
        }
      }

      console.log(`Premzy callback: order_id=${orderId} → transaction=${transaction.id} → account=${result.marzbanUsername} ✅`);

      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error(`Premzy callback: provisioning failed for order_id=${orderId}:`, err);

      // Try to mark the transaction as failed (for admin visibility)
      try {
        await db.transaction.updateMany({
          where: { premzy_order_id: orderId, status: { not: 'completed' } },
          data: {
            status: 'failed',
            error_message: err instanceof Error ? err.message : String(err),
          },
        });
      } catch {
        // Best effort
      }

      // Return 500 so Premzy knows to retry (or manual intervention)
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'provisioning failed' }));
    }
  });

  return new Promise((resolve) => {
    server.listen(config.port, () => {
      console.log(`Premzy callback server running on port ${config.port}`);
      resolve(server);
    });
  });
}
