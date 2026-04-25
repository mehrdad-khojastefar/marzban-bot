import { Telegraf, session } from 'telegraf';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { BotContext } from './context';
import { loadEnv } from '../core/utils/config';
import { initDb } from '../core/db';
import { initMarzban } from '../core/marzban';
import { initMessageService } from './services/messageService';
import { initSettingService } from './services/settingService';
import { createStage, SCENE_START } from './scenes';
import { errorHandler } from './middlewares';
import { registerAdminPaymentHandler } from './handlers';

export async function createBot(): Promise<Telegraf<BotContext>> {
  const env = loadEnv();

  const db = initDb(env.DATABASE_URL);
  initMarzban({
    baseUrl: env.MARZBAN_API_URL,
    username: env.MARZBAN_USERNAME,
    password: env.MARZBAN_PASSWORD,
  });
  initMessageService(db);
  initSettingService(db);

  const telegrafOptions: Partial<Telegraf.Options<BotContext>> = {};
  if (env.SOCKS5_PROXY) {
    const agent = new SocksProxyAgent(env.SOCKS5_PROXY);
    telegrafOptions.telegram = { agent: agent as any };
  }

  const bot = new Telegraf<BotContext>(env.TELEGRAM_BOT_TOKEN, telegrafOptions);
  const stage = createStage();

  bot.use(session());
  bot.use(errorHandler());
  bot.use(stage.middleware());

  bot.command('start', (ctx) => ctx.scene.enter(SCENE_START));
  bot.hears('🏠 منو اصلی', (ctx) => ctx.scene.enter(SCENE_START));

  registerAdminPaymentHandler(bot);

  return bot;
}
