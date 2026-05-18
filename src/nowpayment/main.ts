import 'dotenv/config';
import { loadEnv } from '../core/utils/config';
import { initMarzban } from '../core/marzban';
import { startNowpaymentServer } from './server';

async function main() {
  const env = loadEnv();

  if (!env.NOWPAYMENTS_API_KEY) {
    throw new Error('NOWPAYMENTS_API_KEY is required to run the NowPayments callback server');
  }
  if (!env.NOWPAYMENTS_IPN_SECRET) {
    throw new Error('NOWPAYMENTS_IPN_SECRET is required to run the NowPayments callback server');
  }

  initMarzban({
    baseUrl: env.MARZBAN_API_URL,
    username: env.MARZBAN_USERNAME,
    password: env.MARZBAN_PASSWORD,
  });

  await startNowpaymentServer({
    port: parseInt(env.NOWPAYMENTS_CALLBACK_PORT),
    apiKey: env.NOWPAYMENTS_API_KEY,
    ipnSecret: env.NOWPAYMENTS_IPN_SECRET,
    sandbox: env.NOWPAYMENTS_SANDBOX === 'true',
    databaseUrl: env.DATABASE_URL,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    adminChatId: env.ADMIN_CHAT_ID,
    socksProxy: env.SOCKS5_PROXY,
  });

  console.log('NowPayments callback server started.');
}

main().catch((err) => {
  console.error('Failed to start NowPayments server:', err);
  process.exit(1);
});
