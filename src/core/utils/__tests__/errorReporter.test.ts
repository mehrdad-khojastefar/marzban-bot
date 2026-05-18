import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initErrorReporter,
  reportError,
  isErrorReporterEnabled,
  chunkPayload,
  __resetErrorReporterForTests,
} from '../errorReporter';

function makeFakeTelegram() {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
  };
}

beforeEach(() => {
  __resetErrorReporterForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  __resetErrorReporterForTests();
  vi.useRealTimers();
});

describe('initErrorReporter', () => {
  it('no-ops when chatId is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tg = makeFakeTelegram();
    initErrorReporter({ telegram: tg as any, chatId: undefined, env: 'test' });
    expect(isErrorReporterEnabled()).toBe(false);
    await reportError(new Error('boom'));
    expect(tg.sendMessage).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('no-ops when explicitly disabled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tg = makeFakeTelegram();
    initErrorReporter({ telegram: tg as any, chatId: '-100', env: 'test', enabled: false });
    expect(isErrorReporterEnabled()).toBe(false);
    await reportError(new Error('boom'));
    expect(tg.sendMessage).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('enabled when chatId is set', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tg = makeFakeTelegram();
    initErrorReporter({ telegram: tg as any, chatId: '-100', env: 'test' });
    expect(isErrorReporterEnabled()).toBe(true);
    log.mockRestore();
  });
});

describe('reportError formatting', () => {
  it('sends a <pre> message with header, context, and stack', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tg = makeFakeTelegram();
    initErrorReporter({ telegram: tg as any, chatId: '-100', env: 'production' });

    const err = new Error('something broke');
    await reportError(err, { source: 'bot', user_id: 42, scene: 'BUY_ACCOUNT' });

    expect(tg.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, body, opts] = tg.sendMessage.mock.calls[0];
    expect(chatId).toBe('-100');
    expect(opts).toEqual({ parse_mode: 'HTML' });
    expect(body).toContain('<pre>');
    expect(body).toContain('🚨 [production] bot: Error: something broke');
    expect(body).toContain('user_id: 42');
    expect(body).toContain('scene: BUY_ACCOUNT');
    expect(body).toContain('stack:');
    log.mockRestore();
  });

  it('escapes HTML special chars in the payload', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tg = makeFakeTelegram();
    initErrorReporter({ telegram: tg as any, chatId: '-100', env: 'test' });

    await reportError(new Error('<script>alert(1)</script>'), { source: 'bot' });

    const [, body] = tg.sendMessage.mock.calls[0];
    expect(body).not.toContain('<script>');
    expect(body).toContain('&lt;script&gt;');
    log.mockRestore();
  });

  it('handles non-Error values', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tg = makeFakeTelegram();
    initErrorReporter({ telegram: tg as any, chatId: '-100', env: 'test' });

    await reportError('plain string failure', { source: 'sub' });

    const [, body] = tg.sendMessage.mock.calls[0];
    expect(body).toContain('non-Error thrown');
    expect(body).toContain('plain string failure');
    log.mockRestore();
  });

  it('includes cause chain when present', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tg = makeFakeTelegram();
    initErrorReporter({ telegram: tg as any, chatId: '-100', env: 'test' });

    const root = new Error('root reason');
    const wrapped = new Error('outer', { cause: root });
    await reportError(wrapped);

    const [, body] = tg.sendMessage.mock.calls[0];
    expect(body).toContain('cause:');
    expect(body).toContain('root reason');
    log.mockRestore();
  });
});

describe('dedupe', () => {
  it('collapses duplicates within the TTL window', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tg = makeFakeTelegram();
    initErrorReporter({ telegram: tg as any, chatId: '-100', env: 'test' });

    function thrower() {
      return new Error('dup');
    }
    const e1 = thrower();
    const e2 = thrower();
    const e3 = thrower();

    await reportError(e1);
    await reportError(e2);
    await reportError(e3);

    expect(tg.sendMessage).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it('sends a suppression summary after the TTL', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tg = makeFakeTelegram();
    initErrorReporter({ telegram: tg as any, chatId: '-100', env: 'test' });

    function thrower() {
      return new Error('dup2');
    }
    await reportError(thrower());
    await reportError(thrower());
    await reportError(thrower());

    expect(tg.sendMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(61_000);
    await Promise.resolve();

    expect(tg.sendMessage).toHaveBeenCalledTimes(2);
    const [, summaryBody] = tg.sendMessage.mock.calls[1];
    expect(summaryBody).toContain('duplicate error(s) suppressed');
    log.mockRestore();
  });
});

describe('rate limit', () => {
  it('drops reports after 30/minute', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tg = makeFakeTelegram();
    initErrorReporter({ telegram: tg as any, chatId: '-100', env: 'test' });

    // Each error has a unique message so dedupe key (errorName+firstFrame) varies
    for (let i = 0; i < 40; i++) {
      await reportError(new Error(`unique-${i}-${Math.random()}`));
    }

    expect(tg.sendMessage.mock.calls.length).toBeLessThanOrEqual(30);
    expect(tg.sendMessage.mock.calls.length).toBeGreaterThan(0);
    log.mockRestore();
    warn.mockRestore();
  });
});

describe('isolation', () => {
  it('does not throw when sendMessage rejects', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tg = {
      sendMessage: vi.fn().mockRejectedValue(new Error('telegram down')),
    };
    initErrorReporter({ telegram: tg as any, chatId: '-100', env: 'test' });

    await expect(reportError(new Error('original'))).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    log.mockRestore();
    err.mockRestore();
  });
});

describe('chunkPayload', () => {
  it('returns single chunk when under budget', () => {
    expect(chunkPayload('short', 100)).toEqual(['short']);
  });

  it('splits long payloads on newline boundaries when possible', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i}`).join('\n');
    const chunks = chunkPayload(lines, 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('\n').replace(/\n+/g, '\n')).toContain('line-0');
    expect(chunks.join('\n').replace(/\n+/g, '\n')).toContain('line-19');
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(40);
    }
  });

  it('hard-cuts when no newline available within budget', () => {
    const blob = 'x'.repeat(250);
    const chunks = chunkPayload(blob, 100);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(100);
    expect(chunks[1].length).toBe(100);
    expect(chunks[2].length).toBe(50);
  });
});

describe('multi-message tagging', () => {
  it('tags chunked messages (1/N)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tg = makeFakeTelegram();
    initErrorReporter({ telegram: tg as any, chatId: '-100', env: 'test' });

    const longMsg = 'x'.repeat(8000);
    const err = new Error(longMsg);
    await reportError(err);

    expect(tg.sendMessage.mock.calls.length).toBeGreaterThan(1);
    const firstBody = tg.sendMessage.mock.calls[0][1] as string;
    expect(firstBody).toMatch(/\(1\/\d+\)/);
    log.mockRestore();
  });
});
