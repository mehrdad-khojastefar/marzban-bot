import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AttachedUser } from '../../context';
import {
  resolveAttachedUser,
  invalidateUserCache,
  _resetUserCache,
} from '../attachUser';

const approvedUser: AttachedUser = {
  id: 1,
  chat_id: 100n,
  status: 'approved',
  has_test: false,
  bank_card_id: null,
  plan_group_id: null,
  first_name: 'Mehrdad',
  last_name: null,
  username: null,
};

function makeDb(returnValue: AttachedUser | null) {
  const findUnique = vi.fn().mockResolvedValue(returnValue);
  const db = { user: { findUnique } } as unknown as PrismaClient;
  return { db, findUnique };
}

describe('resolveAttachedUser', () => {
  beforeEach(() => {
    _resetUserCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches from DB on the first call and caches the user', async () => {
    const { db, findUnique } = makeDb(approvedUser);
    const first = await resolveAttachedUser(db, 100);
    expect(first).toEqual(approvedUser);
    expect(findUnique).toHaveBeenCalledTimes(1);
    const second = await resolveAttachedUser(db, 100);
    expect(second).toEqual(approvedUser);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('returns null on miss and caches the negative result', async () => {
    const { db, findUnique } = makeDb(null);
    const first = await resolveAttachedUser(db, 999);
    expect(first).toBeNull();
    const second = await resolveAttachedUser(db, 999);
    expect(second).toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('refetches a positive hit after the 60 s positive TTL elapses', async () => {
    const { db, findUnique } = makeDb(approvedUser);
    await resolveAttachedUser(db, 100);
    vi.setSystemTime(Date.now() + 59_000);
    await resolveAttachedUser(db, 100);
    expect(findUnique).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2_000); // total > 60 s
    await resolveAttachedUser(db, 100);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('refetches a negative hit after the 30 s negative TTL elapses', async () => {
    const { db, findUnique } = makeDb(null);
    await resolveAttachedUser(db, 999);
    vi.setSystemTime(Date.now() + 29_000);
    await resolveAttachedUser(db, 999);
    expect(findUnique).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2_000); // total > 30 s
    await resolveAttachedUser(db, 999);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('separate chat ids have independent cache entries', async () => {
    const { db: db1, findUnique: find1 } = makeDb(approvedUser);
    const { db: db2, findUnique: find2 } = makeDb({
      ...approvedUser,
      id: 2,
      chat_id: 200n,
      first_name: 'Other',
    });
    await resolveAttachedUser(db1, 100);
    await resolveAttachedUser(db2, 200);
    await resolveAttachedUser(db1, 100);
    await resolveAttachedUser(db2, 200);
    expect(find1).toHaveBeenCalledTimes(1);
    expect(find2).toHaveBeenCalledTimes(1);
  });

  it('invalidateUserCache drops the cached entry', async () => {
    const { db, findUnique } = makeDb(approvedUser);
    await resolveAttachedUser(db, 100);
    invalidateUserCache(100);
    await resolveAttachedUser(db, 100);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('uses a slim select shape (no relation includes)', async () => {
    const { db, findUnique } = makeDb(approvedUser);
    await resolveAttachedUser(db, 100);
    const call = findUnique.mock.calls[0][0] as {
      where: { chat_id: bigint };
      select: Record<string, true>;
    };
    expect(call.where).toEqual({ chat_id: 100n });
    expect(call.select).toEqual({
      id: true,
      chat_id: true,
      status: true,
      has_test: true,
      bank_card_id: true,
      plan_group_id: true,
      first_name: true,
      last_name: true,
      username: true,
    });
  });
});
