import { PrismaClient } from '@prisma/client';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface MessageCache {
  messages: Map<string, string>;
  fetchedAt: number;
}

let cache: MessageCache | null = null;
let db: PrismaClient | null = null;
let fetchPromise: Promise<Map<string, string>> | null = null;

async function loadMessages(): Promise<Map<string, string>> {
  if (!db) {
    throw new Error('Message service not initialized. Call initMessageService() first');
  }
  const rows = await db.botMessage.findMany();
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.text);
  }
  return map;
}

async function ensureCache(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.messages;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = loadMessages()
    .then((messages) => {
      cache = { messages, fetchedAt: Date.now() };
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

export function invalidateCache(): void {
  cache = null;
}

export function initMessageService(prisma: PrismaClient): void {
  db = prisma;
  cache = null;
  fetchPromise = null;
}

export function getMessageService() {
  return { getMessage, invalidateCache };
}
