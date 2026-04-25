import { PrismaClient } from '@prisma/client';

const CACHE_TTL_MS = 30 * 1000;

interface SettingCache {
  settings: Map<string, string>;
  fetchedAt: number;
}

let cache: SettingCache | null = null;
let db: PrismaClient | null = null;
let fetchPromise: Promise<Map<string, string>> | null = null;

async function loadSettings(): Promise<Map<string, string>> {
  if (!db) {
    throw new Error('Setting service not initialized. Call initSettingService() first');
  }
  const rows = await db.botSetting.findMany();
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }
  return map;
}

async function ensureCache(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.settings;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = loadSettings()
    .then((settings) => {
      cache = { settings, fetchedAt: Date.now() };
      fetchPromise = null;
      return settings;
    })
    .catch((err) => {
      fetchPromise = null;
      throw err;
    });

  return fetchPromise;
}

export async function getSetting(key: string): Promise<string | null> {
  const settings = await ensureCache();
  return settings.get(key) ?? null;
}

export function invalidateSettingCache(): void {
  cache = null;
}

export function initSettingService(prisma: PrismaClient): void {
  db = prisma;
  cache = null;
  fetchPromise = null;
}
