import http from 'node:http';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Telegraf } from 'telegraf';
import { SocksProxyAgent } from 'socks-proxy-agent';
import {
  provisionAccount,
  buildFullAccountNotification,
  renewAccount,
  buildRenewNotification,
} from '../core/provision';
import { formatBytes } from '../core/utils/format';
import { NowpaymentClient } from '../core/nowpayment/client';
import {
  verifyIpn,
  findTransactionForIpn,
  decideIpnOutcome,
  recordIpnMetadata,
} from '../core/nowpayment/service';

interface NowpaymentServerConfig {
  port: number;
  apiKey: string;
  ipnSecret: string;
  sandbox: boolean;
  databaseUrl: string;
  telegramBotToken: string;
  adminChatId: string;
  socksProxy?: string;
}

export async function startNowpaymentServer(config: NowpaymentServerConfig): Promise<http.Server> {
  const adapter = new PrismaPg({ connectionString: config.databaseUrl });
  const db = new PrismaClient({ adapter });

  const telegrafOptions: Partial<Telegraf.Options<any>> = {};
  if (config.socksProxy) {
    const agent = new SocksProxyAgent(config.socksProxy);
    telegrafOptions.telegram = { agent: agent as any };
  }
  const telegram = new Telegraf(config.telegramBotToken, telegrafOptions).telegram;

  const client = new NowpaymentClient({
    apiKey: config.apiKey,
    ipnSecret: config.ipnSecret,
    sandbox: config.sandbox,
  });

  const server = http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200);
      res.end('ok');
      return;
    }

    if (req.url !== '/nowpayment/ipn' || req.method !== 'POST') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    let rawBody: string;
    try {
      rawBody = await new Promise<string>((resolve, reject) => {
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

    const sigHeader = req.headers['x-nowpayments-sig'];
    const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

    const verified = verifyIpn(client, rawBody, sig);
    if (!verified) {
      console.warn('NowPayments IPN: invalid signature or malformed body');
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'invalid signature' }));
      return;
    }

    const { payload } = verified;
    console.log(
      `NowPayments IPN: order_id=${payload.order_id} payment_id=${String(payload.payment_id)} status=${payload.payment_status}`,
    );

    try {
      const txn = await findTransactionForIpn(db, payload);
      if (!txn) {
        console.warn(`NowPayments IPN: unknown order_id=${payload.order_id}`);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: false, message: 'unknown order' }));
        return;
      }

      // Persist payment_id + pay_currency on every IPN (safe to repeat).
      await recordIpnMetadata(db, txn.id, payload);

      const outcome = decideIpnOutcome(txn, payload);

      switch (outcome.kind) {
        case 'ignored':
          console.log(`NowPayments IPN: ignored — ${outcome.reason}`);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, message: outcome.reason }));
          return;

        case 'progress':
          if (txn.status !== outcome.newStatus) {
            await db.transaction.update({
              where: { id: txn.id },
              data: { status: outcome.newStatus },
            });
          }
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          return;

        case 'provision': {
          // Mark as provisioning to block concurrent IPNs.
          await db.transaction.update({
            where: { id: txn.id },
            data: { status: 'provisioning' },
          });

          const fullTxn = await db.transaction.findUnique({
            where: { id: txn.id },
            include: { user: true, plan: true },
          });
          if (!fullTxn) {
            throw new Error(`Transaction ${String(txn.id)} disappeared during provisioning`);
          }

          let dataLimit: number;
          let durationDays: number;
          let planLabel: string;
          if (fullTxn.plan) {
            dataLimit = Number(fullTxn.plan.data_limit);
            durationDays = fullTxn.plan.duration_days;
            planLabel = fullTxn.plan.name;
          } else {
            dataLimit = Number(fullTxn.data_limit ?? 0);
            durationDays = fullTxn.duration_days;
            planLabel = formatBytes(dataLimit);
          }

          if (fullTxn.type === 'renew') {
            if (!fullTxn.account_id) {
              throw new Error(`Renew transaction ${fullTxn.transaction_id} has no account_id`);
            }
            const renewResult = await renewAccount(db, {
              transactionId: fullTxn.id,
              accountId: fullTxn.account_id,
              dataLimitToAdd: dataLimit,
              durationDays,
            });
            if (fullTxn.user) {
              try {
                const msg = buildRenewNotification(renewResult);
                await telegram.sendMessage(fullTxn.user.chat_id.toString(), msg, { parse_mode: 'HTML' });
              } catch (notifyErr) {
                console.error(`NowPayments IPN: failed to notify user ${String(fullTxn.user.chat_id)}:`, notifyErr);
              }
            }
            console.log(`NowPayments IPN: ${fullTxn.transaction_id} → renewed ${renewResult.marzbanUsername} ✅`);
          } else {
            const result = await provisionAccount(db, {
              transactionId: fullTxn.id,
              userId: fullTxn.user_id,
              planId: fullTxn.plan_id,
              dataLimit,
              durationDays,
              amount: fullTxn.amount,
            });
            if (fullTxn.user) {
              try {
                const msg = await buildFullAccountNotification(result, dataLimit, planLabel);
                await telegram.sendMessage(fullTxn.user.chat_id.toString(), msg, { parse_mode: 'HTML' });
              } catch (notifyErr) {
                console.error(`NowPayments IPN: failed to notify user ${String(fullTxn.user.chat_id)}:`, notifyErr);
              }
            }
            console.log(`NowPayments IPN: ${fullTxn.transaction_id} → account=${result.marzbanUsername} ✅`);
          }

          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        case 'partial_payment':
          await db.transaction.update({
            where: { id: txn.id },
            data: { status: 'failed', error_message: 'nowpayments: partially_paid' },
          });
          await notifyUserAndAdmin(
            db, telegram, config.adminChatId, txn,
            `⚠️ پرداخت ناقص شناسایی شد. لطفاً برای پیگیری با پشتیبانی تماس بگیرید.`,
            `⚠️ NowPayments partial payment\norder=${payload.order_id}\npayment_id=${String(payload.payment_id)}\nactually_paid=${String(payload.actually_paid ?? '')} ${payload.pay_currency ?? ''}`,
          );
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          return;

        case 'expired':
          await db.transaction.update({
            where: { id: txn.id },
            data: { status: 'expired' },
          });
          await notifyUserAndAdmin(
            db, telegram, config.adminChatId, txn,
            `⏰ مهلت پرداخت شما به پایان رسید. می‌توانید سفارش جدیدی ثبت کنید.`,
            null,
          );
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          return;

        case 'failed':
          await db.transaction.update({
            where: { id: txn.id },
            data: { status: 'failed', error_message: `nowpayments: ${outcome.reason}` },
          });
          await notifyUserAndAdmin(
            db, telegram, config.adminChatId, txn,
            `❌ پرداخت شما ناموفق بود. لطفاً با پشتیبانی تماس بگیرید.`,
            `❌ NowPayments failed\norder=${payload.order_id}\npayment_id=${String(payload.payment_id)}`,
          );
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          return;

        case 'refunded':
          await db.transaction.update({
            where: { id: txn.id },
            data: { status: 'cancelled', error_message: 'nowpayments: refunded' },
          });
          await notifyUserAndAdmin(
            db, telegram, config.adminChatId, txn,
            null,
            `↩️ NowPayments refunded\norder=${payload.order_id}\npayment_id=${String(payload.payment_id)}`,
          );
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          return;

        case 'late_finished':
          await notifyUserAndAdmin(
            db, telegram, config.adminChatId, txn,
            `⚠️ پرداخت شما پس از انقضای سفارش رسید. لطفاً با پشتیبانی تماس بگیرید.`,
            `⚠️ NowPayments late_finished — payment after expiry\norder=${payload.order_id}\npayment_id=${String(payload.payment_id)}\namount=${String(payload.actually_paid ?? '')} ${payload.pay_currency ?? ''}`,
          );
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
          return;
      }
    } catch (err) {
      console.error(`NowPayments IPN: processing failed for ${payload.order_id}:`, err);
      try {
        await db.transaction.updateMany({
          where: { transaction_id: payload.order_id, status: { not: 'completed' } },
          data: {
            status: 'failed',
            error_message: err instanceof Error ? err.message : String(err),
          },
        });
      } catch {
        // best effort
      }
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'processing failed' }));
    }
  });

  return new Promise((resolve) => {
    server.listen(config.port, () => {
      console.log(`NowPayments callback server running on port ${String(config.port)}`);
      resolve(server);
    });
  });
}

async function notifyUserAndAdmin(
  db: PrismaClient,
  telegram: Telegraf['telegram'],
  adminChatId: string,
  txn: { user_id: number },
  userMessage: string | null,
  adminMessage: string | null,
): Promise<void> {
  if (userMessage) {
    try {
      const user = await db.user.findUnique({ where: { id: txn.user_id } });
      if (user) {
        await telegram.sendMessage(user.chat_id.toString(), userMessage, { parse_mode: 'HTML' });
      }
    } catch (err) {
      console.error('NowPayments IPN: failed to notify user:', err);
    }
  }
  if (adminMessage) {
    try {
      await telegram.sendMessage(adminChatId, adminMessage, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('NowPayments IPN: failed to notify admin:', err);
    }
  }
}
