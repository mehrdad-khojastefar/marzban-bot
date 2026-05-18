import { describe, it, expect } from 'vitest';
import { createLogger, generateRequestId } from '../logger';

describe('createLogger', () => {
  it('returns a pino logger bound with the source field', () => {
    const log = createLogger({ source: 'test' });
    expect(typeof log.info).toBe('function');
    expect(typeof log.child).toBe('function');
    // A child logger inherits bindings.
    const child = log.child({ requestId: 'rid' });
    expect(typeof child.info).toBe('function');
  });

  it('respects LOG_LEVEL env var', () => {
    const original = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'debug';
    try {
      const log = createLogger({ source: 'test' });
      expect(log.level).toBe('debug');
    } finally {
      if (original === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = original;
    }
  });
});

describe('generateRequestId', () => {
  it('returns a 16-character hex string', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces different ids on consecutive calls', () => {
    const ids = new Set([
      generateRequestId(),
      generateRequestId(),
      generateRequestId(),
      generateRequestId(),
      generateRequestId(),
    ]);
    expect(ids.size).toBe(5);
  });
});
