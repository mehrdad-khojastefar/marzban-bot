import 'dotenv/config';
import { createBot } from './bot';
import { registerProcessHandlers } from '../core/utils/errorReporter';

async function main() {
  const bot = await createBot();

  registerProcessHandlers('bot');

  await bot.launch();
  console.log('Bot started.');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
