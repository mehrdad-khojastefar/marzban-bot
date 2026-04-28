import { loadPanelEnv } from './env';
import { initDb, getDb } from '@/core/db';
import { initMarzban, getMarzban } from '@/core/marzban';

const globalForPanel = globalThis as unknown as {
  __panelBootstrapped?: boolean;
};

export function ensureBootstrap() {
  if (globalForPanel.__panelBootstrapped) return;

  const env = loadPanelEnv();

  try {
    getDb();
  } catch {
    initDb(env.DATABASE_URL);
  }

  try {
    getMarzban();
  } catch {
    initMarzban({
      baseUrl: env.MARZBAN_API_URL,
      username: env.MARZBAN_USERNAME,
      password: env.MARZBAN_PASSWORD,
    });
  }

  globalForPanel.__panelBootstrapped = true;
}
