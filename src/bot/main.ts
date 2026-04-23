import 'dotenv/config';
import { createBot } from './bot';

async function main() {
  const bot = await createBot();

  await bot.launch();
  console.log('Bot started.');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
