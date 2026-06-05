import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaClientMock = vi.fn();
const prismaPgMock = vi.fn();

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: prismaClientMock.mockImplementation(() => ({
      $connect: vi.fn(),
      $disconnect: vi.fn(),
      $on: vi.fn(),
    })),
    Prisma: {},
  };
});

vi.mock('@prisma/adapter-pg', () => {
  return {
    PrismaPg: prismaPgMock.mockImplementation((config: unknown) => ({ config })),
  };
});

describe('DB Singleton', () => {
  beforeEach(() => {
    vi.resetModules();
    prismaClientMock.mockClear();
    prismaPgMock.mockClear();
  });

  it('should throw if getDb is called before initDb', async () => {
    const { getDb } = await import('../client');
    expect(() => getDb()).toThrow('Database client not initialized');
  });

  it('should return a PrismaClient after initDb', async () => {
    const { initDb, getDb } = await import('../client');
    const client = initDb('postgresql://test');
    expect(client).toBeDefined();
    expect(getDb()).toBe(client);
  });

  it('should throw if initDb is called twice', async () => {
    const { initDb } = await import('../client');
    initDb('postgresql://test');
    expect(() => initDb('postgresql://test')).toThrow('Database client already initialized');
  });

  it('should return the same instance on multiple getDb calls', async () => {
    const { initDb, getDb } = await import('../client');
    initDb('postgresql://test');
    expect(getDb()).toBe(getDb());
  });

  it('should pass pool options to PrismaPg adapter (defaults)', async () => {
    const { createPrismaClient } = await import('../client');
    createPrismaClient({ databaseUrl: 'postgresql://test' });
    expect(prismaPgMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: 'postgresql://test',
        max: 25,
        idleTimeoutMillis: 30_000,
      }),
    );
  });

  it('should pass explicit pool options through to PrismaPg adapter', async () => {
    const { createPrismaClient } = await import('../client');
    createPrismaClient({
      databaseUrl: 'postgresql://test',
      poolMax: 7,
      poolIdleMs: 5_000,
    });
    expect(prismaPgMock).toHaveBeenCalledWith(
      expect.objectContaining({ max: 7, idleTimeoutMillis: 5_000 }),
    );
  });

  it('should read pool options from DB_POOL_MAX / DB_POOL_IDLE_MS env vars', async () => {
    const originalMax = process.env.DB_POOL_MAX;
    const originalIdle = process.env.DB_POOL_IDLE_MS;
    process.env.DB_POOL_MAX = '13';
    process.env.DB_POOL_IDLE_MS = '7777';
    try {
      const { createPrismaClient } = await import('../client');
      createPrismaClient({ databaseUrl: 'postgresql://test' });
      expect(prismaPgMock).toHaveBeenCalledWith(
        expect.objectContaining({ max: 13, idleTimeoutMillis: 7_777 }),
      );
    } finally {
      if (originalMax === undefined) delete process.env.DB_POOL_MAX;
      else process.env.DB_POOL_MAX = originalMax;
      if (originalIdle === undefined) delete process.env.DB_POOL_IDLE_MS;
      else process.env.DB_POOL_IDLE_MS = originalIdle;
    }
  });

  it('should register query/warn/error log handlers on the PrismaClient', async () => {
    const { createPrismaClient } = await import('../client');
    const client = createPrismaClient({ databaseUrl: 'postgresql://test' });
    const events = (client.$on as unknown as { mock: { calls: [string, unknown][] } })
      .mock.calls.map((c) => c[0]);
    expect(events).toContain('query');
    expect(events).toContain('warn');
    expect(events).toContain('error');
  });

  it('should throw if DATABASE_URL is not set and no databaseUrl is provided', async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const { createPrismaClient } = await import('../client');
      expect(() => createPrismaClient()).toThrow('DATABASE_URL is not set');
    } finally {
      if (original !== undefined) process.env.DATABASE_URL = original;
    }
  });
});
