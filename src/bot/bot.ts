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
import { errorHandler, channelCheck, eventLoggerMiddleware, attachUser, observability } from './middlewares';
import {
  registerAdminPaymentHandler,
  registerAdminUserApprovalHandler,
  registerAdminBackupHandler,
} from './handlers';
import { setBotInstance } from '../core/events';
import { createLogger } from '../core/logger';
import { startMetricsServer } from '../core/metrics';

export async function createBot(): Promise<Telegraf<BotContext>> {
  const env = loadEnv();
  const logger = createLogger({ source: 'bot' });

  // Surface unhandled rejections at the process level so they end up in
  // structured logs (and the operator's alerts) instead of vanishing.
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandledRejection');
  });

  if (env.METRICS_PORT > 0) {
    startMetricsServer({ port: env.METRICS_PORT, logger });
  }

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
  setBotInstance(bot);
  const stage = createStage();

  // Global intercept: 🏠 منو اصلی and /start always work, even inside scenes.
  // Registered on the stage so it runs after stage setup but before scene handlers.
  stage.hears('🏠 منو اصلی', (ctx) => ctx.scene.enter(SCENE_START));
  stage.command('start', (ctx) => ctx.scene.enter(SCENE_START));

  bot.use(session());
  bot.use(errorHandler());
  bot.use(observability(logger));
  bot.use(attachUser());
  bot.use(eventLoggerMiddleware());
  bot.use(channelCheck());
  bot.use(stage.middleware());

  registerAdminPaymentHandler(bot);
  registerAdminUserApprovalHandler(bot);
  registerAdminBackupHandler(bot);

  // Catch-all for any unhandled errors that bypass the middleware
  bot.catch((err, ctx) => {
    const log = ctx.state.log ?? logger;
    log.error({ err, chatId: ctx.from?.id }, 'bot.catch');
  });

  return bot;
}
