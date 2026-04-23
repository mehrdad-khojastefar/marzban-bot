import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMessage, invalidateCache, initMessageService } from '../messageService';

function createMockDb(rows: { key: string; text: string }[]) {
  return {
    botMessage: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  } as any;
}

const defaultRows = [
  { key: 'home.greeting', text: 'از منوی زیر انتخاب کنید:' },
  { key: 'start.welcome_new', text: 'سلام {first_name}! به ربات VPN خوش آمدید.' },
  { key: 'support.message', text: 'پشتیبانی: {config.support_username}' },
];

describe('MessageService', () => {
  beforeEach(() => {
    invalidateCache();
  });

  it('should return message text by key', async () => {
    const db = createMockDb(defaultRows);
    initMessageService(db);

    const result = await getMessage('home.greeting');
    expect(result).toBe('از منوی زیر انتخاب کنید:');
  });

  it('should replace {variable} placeholders', async () => {
    const db = createMockDb(defaultRows);
    initMessageService(db);

    const result = await getMessage('start.welcome_new', { first_name: 'مهرداد' });
    expect(result).toBe('سلام مهرداد! به ربات VPN خوش آمدید.');
  });

  it('should replace nested placeholders like {config.support_username}', async () => {
    const db = createMockDb(defaultRows);
    initMessageService(db);

    const result = await getMessage('support.message', { 'config.support_username': '@support' });
    expect(result).toBe('پشتیبانی: @support');
  });

  it('should return key string for missing keys', async () => {
    const db = createMockDb(defaultRows);
    initMessageService(db);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await getMessage('nonexistent.key');
    expect(result).toBe('nonexistent.key');
    expect(warnSpy).toHaveBeenCalledWith('Bot message not found: "nonexistent.key"');

    warnSpy.mockRestore();
  });

  it('should cache messages and not query DB on second call', async () => {
    const db = createMockDb(defaultRows);
    initMessageService(db);

    await getMessage('home.greeting');
    await getMessage('start.welcome_new');

    expect(db.botMessage.findMany).toHaveBeenCalledTimes(1);
  });

  it('should refetch after cache invalidation', async () => {
    const db = createMockDb(defaultRows);
    initMessageService(db);

    await getMessage('home.greeting');
    invalidateCache();
    await getMessage('home.greeting');

    expect(db.botMessage.findMany).toHaveBeenCalledTimes(2);
  });

  it('should refetch after TTL expires', async () => {
    const db = createMockDb(defaultRows);
    initMessageService(db);

    await getMessage('home.greeting');

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);

    await getMessage('home.greeting');

    expect(db.botMessage.findMany).toHaveBeenCalledTimes(2);

    vi.restoreAllMocks();
  });

  it('should replace missing placeholders with empty string', async () => {
    const db = createMockDb(defaultRows);
    initMessageService(db);

    const result = await getMessage('start.welcome_new', {});
    expect(result).toBe('سلام ! به ربات VPN خوش آمدید.');
  });

  it('should deduplicate concurrent cache loads', async () => {
    const db = createMockDb(defaultRows);
    initMessageService(db);

    const [r1, r2, r3] = await Promise.all([
      getMessage('home.greeting'),
      getMessage('start.welcome_new'),
      getMessage('support.message', { 'config.support_username': '@test' }),
    ]);

    expect(r1).toBe('از منوی زیر انتخاب کنید:');
    expect(r2).toBe('سلام {first_name}! به ربات VPN خوش آمدید.');
    expect(r3).toBe('پشتیبانی: @test');
    expect(db.botMessage.findMany).toHaveBeenCalledTimes(1);
  });
});
