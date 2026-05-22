import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Account, PrismaClient } from '@prisma/client';
import type { UserResponse } from '../marzban/types';
import {
  applyToAccount,
  executeBatch,
  hasAnyModification,
  resolveAccounts,
} from '../groupModify';

const GB_BYTES = 1073741824;
const DAY_SECONDS = 86400;

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    user_id: 10,
    plan_id: null,
    seller_id: null,
    seller_plan_id: null,
    marzban_username: 'dove_123456',
    marzban_sub_token: null,
    display_name: null,
    type: 'paid',
    payment_status: 'paid',
    price: 0,
    note: null,
    expires_at: new Date('2026-01-01T00:00:00Z'),
    created_at: new Date('2025-12-01T00:00:00Z'),
    ...overrides,
  } as Account;
}

function makeMarzbanUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    proxies: {},
    expire: 0,
    data_limit: 0,
    data_limit_reset_strategy: 'no_reset',
    inbounds: {},
    note: null,
    sub_updated_at: null,
    sub_last_user_agent: null,
    online_at: null,
    on_hold_expire_duration: null,
    on_hold_timeout: null,
    auto_delete_in_days: null,
    next_plan: null,
    username: 'dove_123456',
    status: 'active',
    used_traffic: 0,
    lifetime_used_traffic: 0,
    created_at: '2025-01-01T00:00:00',
    links: [],
    subscription_url: '',
    excluded_inbounds: {},
    admin: null,
    ...overrides,
  };
}

function makeMarzbanMock() {
  return {
    getUser: vi.fn(),
    modifyUser: vi.fn(),
    resetUserDataUsage: vi.fn(),
  };
}

function makeDbMock() {
  return {
    account: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };
}

describe('hasAnyModification', () => {
  it('returns false for an empty mod object', () => {
    expect(hasAnyModification({})).toBe(false);
  });

  it('returns false when resetTraffic is explicitly false', () => {
    expect(hasAnyModification({ resetTraffic: false })).toBe(false);
  });

  it('returns true for each individual mod', () => {
    expect(hasAnyModification({ addGb: 5 })).toBe(true);
    expect(hasAnyModification({ addDays: 30 })).toBe(true);
    expect(hasAnyModification({ status: 'disabled' })).toBe(true);
    expect(hasAnyModification({ resetTraffic: true })).toBe(true);
  });
});

describe('resolveAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters by marzban_username prefix', async () => {
    const db = makeDbMock();
    const accounts = [makeAccount({ marzban_username: 'PRO_a' })];
    db.account.findMany.mockResolvedValue(accounts);

    const result = await resolveAccounts(
      db as unknown as PrismaClient,
      { kind: 'prefix', value: 'PRO_' },
    );

    expect(db.account.findMany).toHaveBeenCalledWith({
      where: { marzban_username: { startsWith: 'PRO_' } },
      orderBy: { created_at: 'desc' },
    });
    expect(result).toBe(accounts);
  });

  it('filters by seller_id', async () => {
    const db = makeDbMock();
    db.account.findMany.mockResolvedValue([]);

    await resolveAccounts(db as unknown as PrismaClient, {
      kind: 'seller',
      sellerId: 7,
    });

    expect(db.account.findMany).toHaveBeenCalledWith({
      where: { seller_id: 7 },
      orderBy: { created_at: 'desc' },
    });
  });

  it('resolves user chat_id → user.id → accounts.user_id', async () => {
    const db = makeDbMock();
    db.user.findUnique.mockResolvedValue({ id: 42 });
    db.account.findMany.mockResolvedValue([]);

    await resolveAccounts(db as unknown as PrismaClient, {
      kind: 'user',
      userChatId: 123456789n,
    });

    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { chat_id: 123456789n },
    });
    expect(db.account.findMany).toHaveBeenCalledWith({
      where: { user_id: 42 },
      orderBy: { created_at: 'desc' },
    });
  });

  it('returns [] when user chat_id has no matching user', async () => {
    const db = makeDbMock();
    db.user.findUnique.mockResolvedValue(null);

    const result = await resolveAccounts(db as unknown as PrismaClient, {
      kind: 'user',
      userChatId: 999n,
    });

    expect(result).toEqual([]);
    expect(db.account.findMany).not.toHaveBeenCalled();
  });
});

describe('applyToAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T00:00:00Z'));
  });

  it('adds GB to current data_limit', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    marzban.getUser.mockResolvedValue(
      makeMarzbanUser({ data_limit: 3 * GB_BYTES, expire: 0 }),
    );

    const result = await applyToAccount(
      db as unknown as PrismaClient,
      marzban,
      makeAccount(),
      { addGb: 5 },
    );

    expect(marzban.modifyUser).toHaveBeenCalledWith('dove_123456', {
      data_limit: 8 * GB_BYTES,
    });
    expect(db.account.update).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newDataLimit).toBe(8 * GB_BYTES);
      expect(result.newExpire).toBeNull();
    }
  });

  it('extends expiry by N days from max(current, now)', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    const nowSec = Math.floor(Date.UTC(2026, 4, 22, 0, 0, 0) / 1000);
    const futureExpire = nowSec + 10 * DAY_SECONDS;
    marzban.getUser.mockResolvedValue(makeMarzbanUser({ expire: futureExpire }));

    const result = await applyToAccount(
      db as unknown as PrismaClient,
      marzban,
      makeAccount(),
      { addDays: 30 },
    );

    expect(marzban.modifyUser).toHaveBeenCalledWith('dove_123456', {
      expire: futureExpire + 30 * DAY_SECONDS,
    });
    expect(db.account.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { expires_at: new Date((futureExpire + 30 * DAY_SECONDS) * 1000) },
    });
    expect(result.ok).toBe(true);
  });

  it('returns previous and new data_limit/expire on success for before/after reporting', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    const nowSec = Math.floor(Date.UTC(2026, 4, 22, 0, 0, 0) / 1000);
    const futureExpire = nowSec + 10 * DAY_SECONDS;
    marzban.getUser.mockResolvedValue(
      makeMarzbanUser({ data_limit: 3 * GB_BYTES, expire: futureExpire }),
    );

    const result = await applyToAccount(
      db as unknown as PrismaClient,
      marzban,
      makeAccount(),
      { addGb: 2, addDays: 5 },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.previousDataLimit).toBe(3 * GB_BYTES);
      expect(result.previousExpire).toBe(futureExpire);
      expect(result.newDataLimit).toBe(5 * GB_BYTES);
      expect(result.newExpire).toBe(futureExpire + 5 * DAY_SECONDS);
    }
  });

  it('subtracts GB from current data_limit', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    marzban.getUser.mockResolvedValue(
      makeMarzbanUser({ data_limit: 10 * GB_BYTES, expire: 0 }),
    );

    const result = await applyToAccount(
      db as unknown as PrismaClient,
      marzban,
      makeAccount(),
      { addGb: -3 },
    );

    expect(marzban.modifyUser).toHaveBeenCalledWith('dove_123456', {
      data_limit: 7 * GB_BYTES,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newDataLimit).toBe(7 * GB_BYTES);
  });

  it('clamps a too-large GB subtraction to a 1-byte floor (never 0 or negative)', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    marzban.getUser.mockResolvedValue(
      makeMarzbanUser({ data_limit: 2 * GB_BYTES, expire: 0 }),
    );

    const result = await applyToAccount(
      db as unknown as PrismaClient,
      marzban,
      makeAccount(),
      { addGb: -100 },
    );

    expect(marzban.modifyUser).toHaveBeenCalledWith('dove_123456', {
      data_limit: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newDataLimit).toBe(1);
  });

  it('subtracts days from a future expiry', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    const nowSec = Math.floor(Date.UTC(2026, 4, 22, 0, 0, 0) / 1000);
    const futureExpire = nowSec + 30 * DAY_SECONDS;
    marzban.getUser.mockResolvedValue(makeMarzbanUser({ expire: futureExpire }));

    await applyToAccount(
      db as unknown as PrismaClient,
      marzban,
      makeAccount(),
      { addDays: -7 },
    );

    expect(marzban.modifyUser).toHaveBeenCalledWith('dove_123456', {
      expire: futureExpire - 7 * DAY_SECONDS,
    });
  });

  it('extends from now when current expiry is in the past', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    const nowSec = Math.floor(Date.UTC(2026, 4, 22, 0, 0, 0) / 1000);
    const expiredAt = nowSec - 5 * DAY_SECONDS;
    marzban.getUser.mockResolvedValue(makeMarzbanUser({ expire: expiredAt }));

    await applyToAccount(
      db as unknown as PrismaClient,
      marzban,
      makeAccount(),
      { addDays: 7 },
    );

    expect(marzban.modifyUser).toHaveBeenCalledWith('dove_123456', {
      expire: nowSec + 7 * DAY_SECONDS,
    });
  });

  it('applies status change without touching data/expiry', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    marzban.getUser.mockResolvedValue(makeMarzbanUser());

    await applyToAccount(
      db as unknown as PrismaClient,
      marzban,
      makeAccount(),
      { status: 'disabled' },
    );

    expect(marzban.modifyUser).toHaveBeenCalledWith('dove_123456', {
      status: 'disabled',
    });
    expect(db.account.update).not.toHaveBeenCalled();
  });

  it('calls resetUserDataUsage when resetTraffic is true', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    marzban.getUser.mockResolvedValue(makeMarzbanUser());

    await applyToAccount(
      db as unknown as PrismaClient,
      marzban,
      makeAccount(),
      { resetTraffic: true },
    );

    expect(marzban.modifyUser).not.toHaveBeenCalled();
    expect(marzban.resetUserDataUsage).toHaveBeenCalledWith('dove_123456');
  });

  it('combines all mods into a single modifyUser call + reset + DB update', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    const nowSec = Math.floor(Date.UTC(2026, 4, 22, 0, 0, 0) / 1000);
    marzban.getUser.mockResolvedValue(
      makeMarzbanUser({ data_limit: 2 * GB_BYTES, expire: 0 }),
    );

    await applyToAccount(
      db as unknown as PrismaClient,
      marzban,
      makeAccount(),
      { addGb: 3, addDays: 10, status: 'active', resetTraffic: true },
    );

    expect(marzban.modifyUser).toHaveBeenCalledTimes(1);
    expect(marzban.modifyUser).toHaveBeenCalledWith('dove_123456', {
      data_limit: 5 * GB_BYTES,
      expire: nowSec + 10 * DAY_SECONDS,
      status: 'active',
    });
    expect(marzban.resetUserDataUsage).toHaveBeenCalledWith('dove_123456');
    expect(db.account.update).toHaveBeenCalledTimes(1);
  });

  it('returns ok=false with the error message and logs the full error when modifyUser throws', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    marzban.getUser.mockResolvedValue(makeMarzbanUser());
    const thrown = new Error('marzban 500');
    marzban.modifyUser.mockRejectedValue(thrown);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await applyToAccount(
      db as unknown as PrismaClient,
      marzban,
      makeAccount(),
      { addGb: 5 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('marzban 500');
      expect(result.username).toBe('dove_123456');
      expect(result.accountId).toBe(1);
    }
    expect(db.account.update).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('dove_123456'),
      thrown,
    );
    errSpy.mockRestore();
  });

  it('skips modifyUser entirely when only resetTraffic is requested', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    marzban.getUser.mockResolvedValue(makeMarzbanUser());

    await applyToAccount(
      db as unknown as PrismaClient,
      marzban,
      makeAccount(),
      { resetTraffic: true },
    );

    expect(marzban.modifyUser).not.toHaveBeenCalled();
  });
});

describe('executeBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T00:00:00Z'));
  });

  it('continues past a failure and reports both successes and failures', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    marzban.getUser.mockResolvedValue(makeMarzbanUser());

    // First two succeed; third throws on modifyUser
    marzban.modifyUser
      .mockResolvedValueOnce(makeMarzbanUser())
      .mockResolvedValueOnce(makeMarzbanUser())
      .mockRejectedValueOnce(new Error('boom'));

    const accounts = [
      makeAccount({ id: 1, marzban_username: 'a' }),
      makeAccount({ id: 2, marzban_username: 'b' }),
      makeAccount({ id: 3, marzban_username: 'c' }),
    ];

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const report = await executeBatch(
      db as unknown as PrismaClient,
      marzban,
      accounts,
      { addGb: 1 },
    );
    errSpy.mockRestore();

    expect(report.total).toBe(3);
    expect(report.succeeded).toBe(2);
    expect(report.failed).toBe(1);
    expect(report.results).toHaveLength(3);
    expect(report.results[2].ok).toBe(false);
  });

  it('invokes onProgress with (done, total) after each account', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    marzban.getUser.mockResolvedValue(makeMarzbanUser());

    const onProgress = vi.fn();
    const accounts = [
      makeAccount({ id: 1, marzban_username: 'a' }),
      makeAccount({ id: 2, marzban_username: 'b' }),
    ];

    await executeBatch(
      db as unknown as PrismaClient,
      marzban,
      accounts,
      { status: 'disabled' },
      onProgress,
    );

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it('preserves original account order in results even when applies finish out of order', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();
    marzban.getUser.mockImplementation(async (username: string) =>
      makeMarzbanUser({ username }),
    );

    // Force a fixed completion order skew: even-indexed accounts wait one
    // extra microtask before resolving, so odd ones complete first.
    let call = 0;
    marzban.modifyUser.mockImplementation(async () => {
      const i = call++;
      if (i % 2 === 0) {
        await Promise.resolve();
        await Promise.resolve();
      }
      return makeMarzbanUser();
    });

    const accounts = Array.from({ length: 6 }, (_, i) =>
      makeAccount({ id: i + 1, marzban_username: `u${String(i + 1)}` }),
    );

    const report = await executeBatch(
      db as unknown as PrismaClient,
      marzban,
      accounts,
      { addGb: 1 },
      undefined,
      4,
    );

    expect(report.total).toBe(6);
    expect(report.results.map((r) => r.accountId)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('honors the concurrency cap (≤ N applies in flight at once)', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();

    let inFlight = 0;
    let peak = 0;
    marzban.getUser.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      await Promise.resolve();
      inFlight--;
      return makeMarzbanUser();
    });
    marzban.modifyUser.mockResolvedValue(makeMarzbanUser());

    const accounts = Array.from({ length: 20 }, (_, i) =>
      makeAccount({ id: i + 1, marzban_username: `u${String(i + 1)}` }),
    );

    await executeBatch(
      db as unknown as PrismaClient,
      marzban,
      accounts,
      { addGb: 1 },
      undefined,
      4,
    );

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('returns an empty report when given no accounts', async () => {
    const db = makeDbMock();
    const marzban = makeMarzbanMock();

    const report = await executeBatch(
      db as unknown as PrismaClient,
      marzban,
      [],
      { addGb: 5 },
    );

    expect(report).toEqual({ total: 0, succeeded: 0, failed: 0, results: [] });
    expect(marzban.getUser).not.toHaveBeenCalled();
  });
});
