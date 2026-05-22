import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter, PassThrough } from 'node:stream';

// Required env (must be set before loadEnv() runs).
process.env.DATABASE_URL = 'postgresql://bot';
process.env.TELEGRAM_BOT_TOKEN = 't';
process.env.MARZBAN_API_URL = 'https://m.example.com';
process.env.MARZBAN_USERNAME = 'u';
process.env.MARZBAN_PASSWORD = 'p';
process.env.ADMIN_CHAT_ID = '1';
process.env.SUPPORT_USERNAME = '@s';
process.env.SUB_BASE_URL = 'https://s.example.com';
process.env.MARZBAN_SUB_URL = 'http://m.internal:8085';
process.env.LOG_GROUP_ID = '-100999';
process.env.LOG_TOPIC_USERS = '1';
process.env.LOG_TOPIC_PAYMENTS = '2';
process.env.LOG_TOPIC_ACCOUNTS = '3';
process.env.LOG_TOPIC_ADMIN = '4';
process.env.LOG_TOPIC_SELLER = '5';
process.env.LOG_TOPIC_ERRORS = '6';
process.env.LOG_TOPIC_SYSTEM = '7';
process.env.LOG_TOPIC_BACKUP_MARZBAN = '8';
process.env.LOG_TOPIC_BACKUP_BOT = '9';
process.env.MARZBAN_DATABASE_URL = 'postgresql://marzban';

import { runBackups, resetBackupRunnerForTests } from '../runner';
import * as eventLogger from '../../events/eventLogger';

type FakeChild = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  exitCode: number | null;
  kill: ReturnType<typeof vi.fn>;
};

function makeChild(): FakeChild {
  const c = new EventEmitter() as FakeChild;
  c.stdout = new PassThrough();
  c.stderr = new PassThrough();
  c.exitCode = null;
  c.kill = vi.fn();
  return c;
}

function feed(child: FakeChild, payload: string, exitCode: number): void {
  setImmediate(() => {
    if (payload) child.stdout.end(payload);
    else child.stdout.end();
    setImmediate(() => {
      child.exitCode = exitCode;
      child.emit('exit', exitCode);
    });
  });
}

function makeBot() {
  return {
    telegram: {
      sendDocument: vi.fn().mockResolvedValue({ message_id: 42 }),
    },
  };
}

describe('runBackups', () => {
  beforeEach(() => {
    resetBackupRunnerForTests();
    // Avoid sending real events.
    vi.spyOn(eventLogger, 'logEvent').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dumps each DB in sequence and uploads to its dedicated topic', async () => {
    const bot = makeBot();
    const children: FakeChild[] = [];
    const spawner = vi.fn(() => {
      const c = makeChild();
      children.push(c);
      feed(c, `-- dump #${String(children.length)}\n`, 0);
      return c;
    });
    const unlinker = vi.fn().mockResolvedValue(undefined);

    const result = await runBackups({
      bot: bot as never,
      trigger: 'cron',
      spawner: spawner as never,
      unlinker,
    });

    expect(result.skipped).toBeNull();
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.ok)).toBe(true);
    expect(result.results.map((r) => r.db)).toEqual(['marzban', 'marzban_bot']);

    expect(bot.telegram.sendDocument).toHaveBeenCalledTimes(2);

    const firstCall = bot.telegram.sendDocument.mock.calls[0];
    expect(firstCall[0]).toBe('-100999');
    expect(firstCall[2].message_thread_id).toBe(8);
    expect(firstCall[2].parse_mode).toBe('HTML');
    expect(firstCall[2].caption).toContain('marzban');

    const secondCall = bot.telegram.sendDocument.mock.calls[1];
    expect(secondCall[2].message_thread_id).toBe(9);
    expect(secondCall[2].caption).toContain('marzban_bot');

    // Tmp files unlinked after upload.
    expect(unlinker).toHaveBeenCalledTimes(2);
  });

  it('continues to the next DB after a pg_dump failure', async () => {
    const bot = makeBot();
    const children: FakeChild[] = [];
    const spawner = vi.fn(() => {
      const c = makeChild();
      children.push(c);
      const idx = children.length;
      if (idx === 1) {
        // First DB fails.
        setImmediate(() => {
          c.stderr.write('boom\n');
          c.stdout.end();
          setImmediate(() => {
            c.exitCode = 2;
            c.emit('exit', 2);
          });
        });
      } else {
        feed(c, '-- ok\n', 0);
      }
      return c;
    });

    const result = await runBackups({
      bot: bot as never,
      trigger: 'cron',
      spawner: spawner as never,
      unlinker: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.results[0].ok).toBe(false);
    expect(result.results[0].db).toBe('marzban');
    expect(result.results[0].error).toContain('boom');
    expect(result.results[1].ok).toBe(true);
    expect(result.results[1].db).toBe('marzban_bot');

    // Only the successful DB was uploaded.
    expect(bot.telegram.sendDocument).toHaveBeenCalledTimes(1);
  });

  it('reports upload errors and still attempts the next DB', async () => {
    const bot = makeBot();
    bot.telegram.sendDocument = vi
      .fn()
      .mockRejectedValueOnce(new Error('telegram 503'))
      .mockResolvedValueOnce({ message_id: 1 });

    const spawner = vi.fn(() => {
      const c = makeChild();
      feed(c, '-- ok\n', 0);
      return c;
    });

    const result = await runBackups({
      bot: bot as never,
      trigger: 'cron',
      spawner: spawner as never,
      unlinker: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.results[0].ok).toBe(false);
    expect(result.results[0].error).toContain('telegram 503');
    expect(result.results[1].ok).toBe(true);
  });

  it('emits system.backup_skipped when a second run starts while one is in flight', async () => {
    const logSpy = vi.spyOn(eventLogger, 'logEvent');
    const bot = makeBot();

    // Build a spawner whose first invocation never completes (we resolve later),
    // so the first run is still holding the isRunning lock when the second
    // attempt starts.
    let holdChild: FakeChild | null = null;
    const release = (): void => {
      if (!holdChild) return;
      holdChild.stdout.end('-- ok\n');
      setImmediate(() => {
        holdChild!.exitCode = 0;
        holdChild!.emit('exit', 0);
      });
    };
    const spawner = vi.fn(() => {
      if (!holdChild) {
        holdChild = makeChild();
        return holdChild;
      }
      const c = makeChild();
      feed(c, '-- ok\n', 0);
      return c;
    });

    const first = runBackups({
      bot: bot as never,
      trigger: 'cron',
      spawner: spawner as never,
      unlinker: vi.fn().mockResolvedValue(undefined),
    });

    // Yield once so the first call enters the runner and acquires the lock.
    await new Promise((r) => setImmediate(r));

    const second = await runBackups({
      bot: bot as never,
      trigger: 'manual',
      spawner: spawner as never,
      unlinker: vi.fn().mockResolvedValue(undefined),
    });

    expect(second.skipped).toBe('already_running');
    expect(logSpy).toHaveBeenCalledWith('system.backup_skipped', {
      trigger: 'manual',
      reason: 'already_running',
    });

    release();
    await first;
  });
});
