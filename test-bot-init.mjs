import 'dotenv/config';

function step(name) {
  return new Promise((resolve) => {
    console.log(`>>> ${name}...`);
    resolve();
  });
}

const t0 = Date.now();
const log = (msg) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

log('starting');

await step('import loadEnv');
const { loadEnv } = await import('./src/core/utils/config.ts');
log('loadEnv imported');

await step('loadEnv()');
const env = loadEnv();
log('env loaded');

await step('import initDb');
const { initDb } = await import('./src/core/db/index.ts');
log('initDb imported');

await step('initDb()');
const db = initDb(env.DATABASE_URL);
log('db init');

await step('import marzban');
const { initMarzban } = await import('./src/core/marzban/index.ts');
log('marzban imported');

await step('initMarzban()');
initMarzban({
  baseUrl: env.MARZBAN_API_URL,
  username: env.MARZBAN_USERNAME,
  password: env.MARZBAN_PASSWORD,
});
log('marzban init');

await step('import messageService');
const { initMessageService } = await import('./src/bot/services/messageService.ts');
log('messageService imported');

await step('initMessageService()');
await initMessageService(db);
log('messageService init done');

await step('import settingService');
const { initSettingService } = await import('./src/bot/services/settingService.ts');
log('settingService imported');

await step('initSettingService()');
await initSettingService(db);
log('settingService init done');

log('ALL INIT STEPS PASSED');
process.exit(0);
