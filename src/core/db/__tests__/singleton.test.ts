import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: vi.fn().mockImplementation(() => ({
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    })),
  };
});

vi.mock('@prisma/adapter-pg', () => {
  return {
    PrismaPg: vi.fn().mockImplementation(() => ({})),
  };
});

describe('DB Singleton', () => {
  beforeEach(() => {
    vi.resetModules();
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
});
