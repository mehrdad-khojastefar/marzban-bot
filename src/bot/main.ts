import 'dotenv/config';
import { createBot } from './bot';
import { logEvent } from '../core/events';

async function main() {
  const bot = await createBot();

  await bot.launch();
  console.log('Bot started.');

  logEvent('system.bot_started', {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    version: process.env.npm_package_version ?? '0.1.0',
  });

  const stop = (signal: 'SIGINT' | 'SIGTERM') => {
    logEvent('system.bot_stopping', { signal });
    bot.stop(signal);
  };

  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
