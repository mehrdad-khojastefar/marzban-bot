import 'dotenv/config';
import { createBot } from './bot';
import { logEvent } from '../core/events';
import { startBackupScheduler, stopBackupScheduler } from '../core/backup';

async function main() {
  const bot = await createBot();

  // bot.launch() resolves only when polling stops, so we must NOT await it
  // here — we use the onLaunch callback to run post-connect setup.
  void bot.launch({}, async () => {
    console.log('Bot started.');

    logEvent('system.bot_started', {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      version: process.env.npm_package_version ?? '0.1.0',
    });

    await startBackupScheduler(bot);
  });

  const stop = (signal: 'SIGINT' | 'SIGTERM') => {
    logEvent('system.bot_stopping', { signal });
    stopBackupScheduler();
    bot.stop(signal);
  };

  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
