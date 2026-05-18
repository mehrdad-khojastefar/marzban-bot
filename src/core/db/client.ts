import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const DEFAULT_POOL_MAX = 25;
const DEFAULT_POOL_IDLE_MS = 30_000;
const DEFAULT_SLOW_QUERY_MS = 100;

export interface CreatePrismaClientOptions {
  databaseUrl?: string;
  poolMax?: number;
  poolIdleMs?: number;
  slowQueryMs?: number;
  source?: string;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function countParams(serialized: string): number {
  try {
    const parsed = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function createPrismaClient(
  options: CreatePrismaClientOptions = {},
): PrismaClient {
  const url = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const poolMax = options.poolMax ?? readIntEnv('DB_POOL_MAX', DEFAULT_POOL_MAX);
  const poolIdleMs =
    options.poolIdleMs ?? readIntEnv('DB_POOL_IDLE_MS', DEFAULT_POOL_IDLE_MS);
  const slowQueryMs =
    options.slowQueryMs ?? readIntEnv('DB_SLOW_QUERY_MS', DEFAULT_SLOW_QUERY_MS);
  const source = options.source ?? 'db';

  const adapter = new PrismaPg({
    connectionString: url,
    max: poolMax,
    idleTimeoutMillis: poolIdleMs,
  });

  const client = new PrismaClient({
    adapter,
    log: [
      { level: 'query', emit: 'event' },
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });

  client.$on('query', (e: Prisma.QueryEvent) => {
    if (e.duration >= slowQueryMs) {
      // Never log raw params — they can contain PII (chat_id, names, tokens).
      console.warn(
        `[${source}:slow] ${e.duration}ms params=${countParams(e.params)} ${e.query}`,
      );
    }
  });

  client.$on('warn', (e: Prisma.LogEvent) =>
    console.warn(`[${source}:warn]`, e.message),
  );
  client.$on('error', (e: Prisma.LogEvent) =>
    console.error(`[${source}:error]`, e.message),
  );

  return client;
}

let instance: PrismaClient | null = null;

export function initDb(
  optionsOrUrl?: string | CreatePrismaClientOptions,
): PrismaClient {
  if (instance) {
    throw new Error('Database client already initialized');
  }
  const options: CreatePrismaClientOptions =
    typeof optionsOrUrl === 'string' ? { databaseUrl: optionsOrUrl } : (optionsOrUrl ?? {});
  instance = createPrismaClient({ source: 'bot', ...options });
  return instance;
}

export function getDb(): PrismaClient {
  if (!instance) {
    throw new Error('Database client not initialized. Call initDb() first');
  }
  return instance;
}
