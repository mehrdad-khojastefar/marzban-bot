import 'dotenv/config';
import { loadEnv } from '../core/utils/config';
import { initMarzban } from '../core/marzban';
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

  await startPremzyServer({
    port: parseInt(env.PREMZY_CALLBACK_PORT),
    vendorToken: env.PREMZY_VENDOR_TOKEN,
    databaseUrl: env.DATABASE_URL,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
  });

  console.log('Premzy callback server started.');
}

main().catch((err) => {
  console.error('Failed to start Premzy server:', err);
  process.exit(1);
});
