import type { Middleware } from 'telegraf';
import type { PrismaClient } from '@prisma/client';
import type { BotContext, AttachedUser } from '../context';
import { getDb } from '../../core/db';

const POSITIVE_TTL_MS = 60_000; // 60 s for hits (rapid clicks reuse the row)
const NEGATIVE_TTL_MS = 30_000; // 30 s for misses (pending/banned spam)
const MAX_CACHE_SIZE = 10_000;  // bound — eviction is FIFO-ish

interface CacheEntry {
  user: AttachedUser | null;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function evictIfFull(): void {
  if (cache.size <= MAX_CACHE_SIZE) return;
  // Evict ~10% of the oldest keys. Map iteration order is insertion order.
  let toRemove = Math.floor(MAX_CACHE_SIZE * 0.1);
  for (const key of cache.keys()) {
    if (toRemove <= 0) break;
    cache.delete(key);
    toRemove -= 1;
  }
}

function isFresh(entry: CacheEntry, now: number): boolean {
  const ttl = entry.user ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
  return now - entry.fetchedAt < ttl;
}

async function fetchUser(db: PrismaClient, chatId: number): Promise<AttachedUser | null> {
  return db.user.findUnique({
    where: { chat_id: BigInt(chatId) },
    select: {
      id: true,
      chat_id: true,
      status: true,
      has_test: true,
      bank_card_id: true,
      plan_group_id: true,
      first_name: true,
      last_name: true,
      username: true,
    },
  });
}

/**
 * Resolve the User row for a Telegram chat id, hitting the cache first.
 * Exported so callers outside the middleware (e.g. handler that needs the
 * user but runs before / after the middleware chain) can share the cache.
 */
export async function resolveAttachedUser(
  db: PrismaClient,
  chatId: number,
): Promise<AttachedUser | null> {
  const key = String(chatId);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && isFresh(cached, now)) {
    return cached.user;
  }
  const user = await fetchUser(db, chatId);
  cache.set(key, { user, fetchedAt: now });
  evictIfFull();
  return user;
}

/**
 * Drop the cached entry for a chat id. Call this whenever the User row is
 * mutated (approve, ban, plan-group change, etc.) so the next middleware
 * pass sees fresh state.
 */
export function invalidateUserCache(chatId: number | bigint): void {
  cache.delete(String(chatId));
}

/**
 * For tests only — wipe the cache.
 */
export function _resetUserCache(): void {
  cache.clear();
}

/**
 * Middleware: attach `ctx.state.user` once per update.
 *
 * Saves N findUnique calls per update across scenes / handlers that all
 * need the same User row. Registered early in the middleware chain (after
 * errorHandler, before channelCheck and the scene stage).
 */
export function attachUser(): Middleware<BotContext> {
  return async (ctx, next) => {
    const chatId = ctx.from?.id;
    if (chatId === undefined) {
      await next();
      return;
    }
    ctx.state.user = await resolveAttachedUser(getDb(), chatId);
    await next();
  };
}
