import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { SocksProxyAgent } from 'socks-proxy-agent';

const agent = new SocksProxyAgent('socks5h://127.0.0.1:12334');

console.log('[1/4] Creating Telegraf instance...');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  telegram: { agent },
});

console.log('[2/4] Calling getMe...');
const t0 = Date.now();
try {
  const me = await bot.telegram.getMe();
  console.log(`[3/4] getMe OK in ${Date.now() - t0}ms — bot username:`, me.username);
} catch (e) {
  console.log(`[3/4] getMe FAILED in ${Date.now() - t0}ms:`, e.message);
  process.exit(1);
}

console.log('[4/4] All good. Exiting.');
process.exit(0);
