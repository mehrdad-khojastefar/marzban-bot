import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadEnv } from '../config';

const validEnv = {
  DATABASE_URL: 'postgresql://localhost/test',
  TELEGRAM_BOT_TOKEN: '123:ABC',
  MARZBAN_API_URL: 'https://panel.example.com',
  MARZBAN_USERNAME: 'admin',
  MARZBAN_PASSWORD: 'pass',
  ADMIN_CHAT_ID: '12345',
  CARD_NUMBER: '6037-xxxx',
  SUPPORT_USERNAME: '@support',
};

describe('loadEnv', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should parse valid environment variables', () => {
    Object.assign(process.env, validEnv);
    const env = loadEnv();
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(env.TELEGRAM_BOT_TOKEN).toBe(validEnv.TELEGRAM_BOT_TOKEN);
    expect(env.ADMIN_CHAT_ID).toBe(validEnv.ADMIN_CHAT_ID);
  });

  it('should throw on missing required variables', () => {
    process.env = { NODE_ENV: 'test' };
    expect(() => loadEnv()).toThrow('Missing or invalid environment variables');
  });

  it('should throw on invalid MARZBAN_API_URL', () => {
    Object.assign(process.env, { ...validEnv, MARZBAN_API_URL: 'not-a-url' });
    expect(() => loadEnv()).toThrow();
  });

  it('should allow optional NODE_ENV', () => {
    Object.assign(process.env, validEnv);
    delete process.env.NODE_ENV;
    const env = loadEnv();
    expect(env.NODE_ENV).toBeUndefined();
  });
});
