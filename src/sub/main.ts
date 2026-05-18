import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { loadEnv } from '../core/utils/config';
import { initErrorReporter, registerProcessHandlers } from '../core/utils/errorReporter';
import { startSubServer } from './server';

async function main() {
  const env = loadEnv();

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
  registerProcessHandlers('sub');

  await startSubServer({
    port: parseInt(env.SUB_PORT),
    marzbanSubUrl: env.MARZBAN_SUB_URL,
    defaultLinkPrefix: env.CONFIG_LINK_PREFIX,
    databaseUrl: env.DATABASE_URL,
  });

  console.log('Sub proxy started.');
}

main().catch((err) => {
  console.error('Failed to start sub proxy:', err);
  process.exit(1);
});
