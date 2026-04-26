import 'dotenv/config';
import { loadEnv } from '../core/utils/config';
import { startSubServer } from './server';

async function main() {
  const env = loadEnv();

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
