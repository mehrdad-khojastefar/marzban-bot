import { PrismaClient } from '@prisma/client';

// Safety-net TTL — even with version-bump invalidation, refresh at most every
// 5 min so out-of-process writes (e.g. a manual `psql` edit) don't stay stuck
// in memory forever.
const FALLBACK_TTL_MS = 5 * 60 * 1000;

interface SettingCache {
  settings: Map<string, string>;
  fetchedAt: number;
  version: number;
}

let cache: SettingCache | null = null;
let cacheVersion = 0;
let db: PrismaClient | null = null;
let fetchPromise: Promise<Map<string, string>> | null = null;

async function loadSettings(): Promise<Map<string, string>> {
  if (!db) {
    throw new Error('Setting service not initialized. Call initSettingService() first');
  }
  // Hot path — runs whenever the in-process cache is cold or stale. Select
  // only the two fields we actually use; never hydrate `updated_at`.
  const rows = await db.botSetting.findMany({
    select: { key: true, value: true },
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }
  return map;
}

function isCacheFresh(): boolean {
  if (!cache) return false;
  if (cache.version !== cacheVersion) return false;
  if (Date.now() - cache.fetchedAt >= FALLBACK_TTL_MS) return false;
  return true;
}

async function ensureCache(): Promise<Map<string, string>> {
  if (isCacheFresh()) {
    return cache!.settings;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  const versionAtStart = cacheVersion;
  fetchPromise = loadSettings()
    .then((settings) => {
      cache = { settings, fetchedAt: Date.now(), version: versionAtStart };
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

/**
 * Bump the cache version so the next `getSetting` call repopulates from the
 * database. Use this when something external has changed `bot_settings`
 * (e.g. an admin write via `updateSetting` or a manual DB edit).
 */
export function bumpSettingCache(): void {
  cacheVersion += 1;
}

/**
 * Hard reset of the cache — drops the cache reference and bumps the version.
 * Intended for tests; `bumpSettingCache` is the preferred runtime API.
 */
export function invalidateSettingCache(): void {
  cache = null;
  cacheVersion += 1;
  fetchPromise = null;
}

/**
 * Write-through API: upsert a bot setting and bump the cache so the next
 * read picks up the change immediately. Use this from admin scenes that
 * toggle feature flags — never write to `bot_settings` directly.
 */
export async function updateSetting(key: string, value: string): Promise<void> {
  if (!db) {
    throw new Error('Setting service not initialized. Call initSettingService() first');
  }
  await db.botSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  bumpSettingCache();
}

export function initSettingService(prisma: PrismaClient): void {
  db = prisma;
  cache = null;
  cacheVersion = 0;
  fetchPromise = null;
}
