import { PrismaClient } from '@prisma/client';

// Safety-net TTL — even with version-bump invalidation, refresh at most every
// 30 min so out-of-process writes (e.g. a manual `psql` edit) don't stay
// stuck in memory forever.
const FALLBACK_TTL_MS = 30 * 60 * 1000;

interface MessageCache {
  messages: Map<string, string>;
  fetchedAt: number;
  version: number;
}

let cache: MessageCache | null = null;
let cacheVersion = 0;
let db: PrismaClient | null = null;
let fetchPromise: Promise<Map<string, string>> | null = null;

async function loadMessages(): Promise<Map<string, string>> {
  if (!db) {
    throw new Error('Message service not initialized. Call initMessageService() first');
  }
  // Hot path — runs whenever the in-process cache is cold or stale. Select
  // only the two fields we actually use; never hydrate `id` / `updated_at`.
  const rows = await db.botMessage.findMany({
    select: { key: true, text: true },
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.text);
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
    // Type narrowing: cache cannot be null here because isCacheFresh() returns false on null.
    return cache!.messages;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  const versionAtStart = cacheVersion;
  fetchPromise = loadMessages()
    .then((messages) => {
      cache = { messages, fetchedAt: Date.now(), version: versionAtStart };
      fetchPromise = null;
      return messages;
    })
    .catch((err) => {
      fetchPromise = null;
      throw err;
    });

  return fetchPromise;
}

function replacePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+(?:\.\w+)*)}/g, (_, key) => vars[key] ?? '');
}

export async function getMessage(key: string, vars?: Record<string, string>): Promise<string> {
  const messages = await ensureCache();
  const text = messages.get(key);

  if (!text) {
    console.warn(`Bot message not found: "${key}"`);
    return key;
  }

  if (vars) {
    return replacePlaceholders(text, vars);
  }

  return text;
}

/**
 * Bump the cache version so the next `getMessage` call repopulates from the
 * database. Use this when something external has changed `bot_messages`
 * (e.g. an admin write via `updateMessage` or a manual DB edit).
 */
export function bumpMessageCache(): void {
  cacheVersion += 1;
}

/**
 * Hard reset of the cache — drops the cache reference and bumps the version.
 * Intended for tests; `bumpMessageCache` is the preferred runtime API.
 */
export function invalidateCache(): void {
  cache = null;
  cacheVersion += 1;
  fetchPromise = null;
}

/**
 * Write-through API: upsert a bot message and bump the cache so the next
 * read picks up the change immediately. Use this from admin scenes that
 * edit message text — never write to `bot_messages` directly.
 */
export async function updateMessage(key: string, text: string): Promise<void> {
  if (!db) {
    throw new Error('Message service not initialized. Call initMessageService() first');
  }
  await db.botMessage.upsert({
    where: { key },
    create: { key, text },
    update: { text },
  });
  bumpMessageCache();
}

export function initMessageService(prisma: PrismaClient): void {
  db = prisma;
  cache = null;
  cacheVersion = 0;
  fetchPromise = null;
}

export function getMessageService() {
  return { getMessage, invalidateCache, bumpMessageCache, updateMessage };
}
