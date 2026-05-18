import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { loadEnv } from '../core/utils/config';
import { initMarzban } from '../core/marzban';
import { initErrorReporter, registerProcessHandlers } from '../core/utils/errorReporter';
import { startPremzyServer } from './server';

async function main() {
  const env = loadEnv();

  if (!env.PREMZY_VENDOR_TOKEN) {
    throw new Error('PREMZY_VENDOR_TOKEN is required to run the Premzy callback server');
  }

  initMarzban({
    baseUrl: env.MARZBAN_API_URL,
    username: env.MARZBAN_USERNAME,
    password: env.MARZBAN_PASSWORD,
  });

  const telegrafOptions: Partial<Telegraf.Options<any>> = {};
  if (env.SOCKS5_PROXY && env.NODE_ENV !== 'production') {
    const agent = new SocksProxyAgent(env.SOCKS5_PROXY);
    telegrafOptions.telegram = { agent: agent as any };
  }
  const telegram = new Telegraf(env.TELEGRAM_BOT_TOKEN, telegrafOptions).telegram;

  initErrorReporter({
    telegram,
    chatId: env.ERROR_CHAT_ID,
    env: env.NODE_ENV ?? 'development',
    enabled: env.ERROR_REPORTING_ENABLED !== 'false',
  });
  registerProcessHandlers('premzy');

  await startPremzyServer({
    port: parseInt(env.PREMZY_CALLBACK_PORT),
    vendorToken: env.PREMZY_VENDOR_TOKEN,
    databaseUrl: env.DATABASE_URL,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    socksProxy: env.SOCKS5_PROXY,
  });

  console.log('Premzy callback server started.');
}

main().catch((err) => {
  console.error('Failed to start Premzy server:', err);
  process.exit(1);
});
