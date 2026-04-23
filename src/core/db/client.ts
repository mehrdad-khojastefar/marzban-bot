import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

let instance: PrismaClient | null = null;

export function initDb(databaseUrl?: string): PrismaClient {
  if (instance) {
    throw new Error('Database client already initialized');
  }
  const url = databaseUrl ?? process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: url });
  instance = new PrismaClient({ adapter });
  return instance;
}

export function getDb(): PrismaClient {
  if (!instance) {
    throw new Error('Database client not initialized. Call initDb() first');
  }
  return instance;
}
