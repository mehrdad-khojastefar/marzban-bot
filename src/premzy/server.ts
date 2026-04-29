import http from 'node:http';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Telegraf } from 'telegraf';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { provisionAccount, buildFullAccountNotification, renewAccount, buildRenewNotification } from '../core/provision';
import { formatBytes } from '../core/utils/format';

interface PremzyServerConfig {
  port: number;
  vendorToken: string;
  databaseUrl: string;
  telegramBotToken: string;
  socksProxy?: string;
}

export async function startPremzyServer(config: PremzyServerConfig): Promise<http.Server> {
  const adapter = new PrismaPg({ connectionString: config.databaseUrl });
  const db = new PrismaClient({ adapter });

  const telegrafOptions: Partial<Telegraf.Options<any>> = {};
  if (config.socksProxy) {
    const agent = new SocksProxyAgent(config.socksProxy);
    telegrafOptions.telegram = { agent: agent as any };
  }
  const telegram = new Telegraf(config.telegramBotToken, telegrafOptions).telegram;

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

    let transactionId: string;
    try {
      console.log('Premzy callback body:', body);
      const parsed = JSON.parse(body);
      transactionId = parsed.transaction_id;
      if (!transactionId || typeof transactionId !== 'string') {
        throw new Error('missing transaction_id');
      }
    } catch {
      console.warn('Premzy callback: invalid body:', body);
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid body, expected { transaction_id: string }' }));
      return;
    }

    console.log(`Premzy callback received: transaction_id=${transactionId}`);

    try {
      // Look up the transaction by our UUID — exact match
      const transaction = await db.transaction.findUnique({
        where: { transaction_id: transactionId },
        include: { user: true, plan: true },
      });

      if (!transaction) {
        console.error(`Premzy callback: transaction not found: ${transactionId}`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: false, message: 'transaction not found' }));
        return;
      }

      // Idempotency: already completed — return success
      if (transaction.status === 'completed') {
        console.log(`Premzy callback: transaction ${transactionId} already completed`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, message: 'already processed' }));
        return;
      }

      // Already provisioning — return success (in progress)
      if (transaction.status === 'provisioning') {
        console.log(`Premzy callback: transaction ${transactionId} already provisioning`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, message: 'in progress' }));
        return;
      }

      // Only process checkout or failed (retry) transactions
      if (!['checkout', 'failed'].includes(transaction.status)) {
        console.warn(`Premzy callback: unexpected status ${transaction.status} for ${transactionId}`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: false, message: `unexpected status: ${transaction.status}` }));
        return;
      }

      // Mark as provisioning
      await db.transaction.update({
        where: { id: transaction.id },
        data: { status: 'provisioning' },
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

      // Route based on transaction type
      if (transaction.type === 'renew') {
        // ── Renew flow ──
        if (!transaction.account_id) {
          throw new Error(`Renew transaction ${transactionId} has no account_id`);
        }

        const renewResult = await renewAccount(db, {
          transactionId: transaction.id,
          accountId: transaction.account_id,
          dataLimitToAdd: dataLimit,
          durationDays,
        });

        if (transaction.user) {
          try {
            const msg = buildRenewNotification(renewResult);
            await telegram.sendMessage(transaction.user.chat_id.toString(), msg, { parse_mode: 'HTML' });
          } catch (notifyErr) {
            console.error(`Premzy callback: failed to notify user ${transaction.user.chat_id}:`, notifyErr);
          }
        }

        console.log(`Premzy callback: ${transactionId} → renewed account=${renewResult.marzbanUsername} ✅`);
      } else {
        // ── Buy flow (existing) ──
        const result = await provisionAccount(db, {
          transactionId: transaction.id,
          userId: transaction.user_id,
          planId: transaction.plan_id,
          dataLimit,
          durationDays,
          amount: transaction.amount,
        });

        if (transaction.user) {
          try {
            const msg = await buildFullAccountNotification(result, dataLimit, planLabel);
            await telegram.sendMessage(transaction.user.chat_id.toString(), msg, { parse_mode: 'HTML' });
          } catch (notifyErr) {
            console.error(`Premzy callback: failed to notify user ${transaction.user.chat_id}:`, notifyErr);
          }
        }

        console.log(`Premzy callback: ${transactionId} → account=${result.marzbanUsername} ✅`);
      }

      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error(`Premzy callback: provisioning failed for ${transactionId}:`, err);

      // Mark as failed for admin visibility
      try {
        await db.transaction.updateMany({
          where: { transaction_id: transactionId, status: { not: 'completed' } },
          data: {
            status: 'failed',
            error_message: err instanceof Error ? err.message : String(err),
          },
        });
      } catch {
        // Best effort
      }

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
