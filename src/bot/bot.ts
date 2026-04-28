import { Telegraf, session } from 'telegraf';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { BotContext } from './context';
import { loadEnv } from '../core/utils/config';
import { initDb } from '../core/db';
import { initMarzban } from '../core/marzban';
import { initMessageService } from './services/messageService';
import { initSettingService } from './services/settingService';
import { initPremzyJwt } from '../premzy/jwt';
import { createStage, SCENE_START } from './scenes';
import { errorHandler } from './middlewares';
import { registerAdminPaymentHandler, registerAdminUserApprovalHandler } from './handlers';

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

  // Initialize Premzy JWT signing if configured
  if (env.PREMZY_VENDOR_ID && env.PREMZY_EC_PRIVATE_KEY_PATH) {
    try {
      initPremzyJwt({
        vendorId: env.PREMZY_VENDOR_ID,
        privateKeyPath: env.PREMZY_EC_PRIVATE_KEY_PATH,
      });
      console.log('Premzy JWT initialized.');
    } catch (err) {
      console.warn('Premzy JWT not available:', (err as Error).message);
    }
  }

  const telegrafOptions: Partial<Telegraf.Options<BotContext>> = {};
  if (env.SOCKS5_PROXY && env.NODE_ENV !== 'production') {
    const agent = new SocksProxyAgent(env.SOCKS5_PROXY);
    telegrafOptions.telegram = { agent: agent as any };
  }

  const bot = new Telegraf<BotContext>(env.TELEGRAM_BOT_TOKEN, telegrafOptions);
  const stage = createStage();

  // Global intercept: 🏠 منو اصلی and /start always work, even inside scenes.
  // Registered on the stage so it runs after stage setup but before scene handlers.
  stage.hears('🏠 منو اصلی', (ctx) => ctx.scene.enter(SCENE_START));
  stage.command('start', (ctx) => ctx.scene.enter(SCENE_START));

  bot.use(session());
  bot.use(errorHandler());
  bot.use(stage.middleware());

  registerAdminPaymentHandler(bot);
  registerAdminUserApprovalHandler(bot);

  // Catch-all for any unhandled errors that bypass the middleware
  bot.catch((err, ctx) => {
    console.error(`Unhandled bot error [user=${ctx.from?.id}]:`, err);
  });

  return bot;
}
