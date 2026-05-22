import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Account, PrismaClient, User } from '@prisma/client';
import { moveAccountOwnership } from '../moveAccount';

vi.mock('../events', () => ({
  logEvent: vi.fn(),
}));

import { logEvent } from '../events';

const logEventMock = vi.mocked(logEvent);

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 10,
    chat_id: 100n,
    username: null,
    first_name: 'Alice',
    last_name: null,
    status: 'approved',
    has_test: false,
    bank_card_id: null,
    plan_group_id: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as User;
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    user_id: 10,
    plan_id: null,
    seller_id: 7,
    seller_plan_id: null,
    marzban_username: 'dove_abc',
    marzban_sub_token: null,
    display_name: null,
    type: 'paid',
    payment_status: 'paid',
    price: 0,
    note: null,
    expires_at: new Date('2026-06-01T00:00:00Z'),
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Account;
}

function makeDbMock(opts: {
  account?: (Account & { user: User }) | null;
  newUser?: User | null;
  updated?: Account;
}) {
  const updated = opts.updated ?? makeAccount({ user_id: 20 });
  return {
    account: {
      findUnique: vi.fn().mockResolvedValue(opts.account ?? null),
      update: vi.fn().mockResolvedValue(updated),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(opts.newUser ?? null),
    },
  };
}

describe('moveAccountOwnership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates user_id, preserves seller_id, and emits an event on success', async () => {
    const currentOwner = makeUser({ id: 10, chat_id: 100n, first_name: 'Alice' });
    const newOwner = makeUser({ id: 20, chat_id: 200n, first_name: 'Bob' });
    const account = { ...makeAccount({ user_id: 10, seller_id: 7 }), user: currentOwner };

    const db = makeDbMock({ account, newUser: newOwner });

    const result = await moveAccountOwnership({
      db: db as unknown as PrismaClient,
      accountId: 1,
      newUserId: 20,
      actor: { chatId: 999n, name: 'Admin', username: null },
    });

    expect(db.account.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { user_id: 20 },
    });
    // seller_id is not part of the update payload → preserved
    expect(db.account.update.mock.calls[0][0].data).not.toHaveProperty('seller_id');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fromUserId).toBe(10);
      expect(result.fromChatId).toBe(100n);
    }

    expect(logEventMock).toHaveBeenCalledTimes(1);
    expect(logEventMock).toHaveBeenCalledWith(
      'admin.account_ownership_moved',
      {
        accountId: 1,
        marzbanUsername: 'dove_abc',
        fromUserId: 10,
        fromChatId: 100n,
        toUserId: 20,
        toChatId: 200n,
      },
      { chatId: 999n, name: 'Admin', username: null },
    );
  });

  it('returns account_not_found when the account does not exist', async () => {
    const db = makeDbMock({ account: null });

    const result = await moveAccountOwnership({
      db: db as unknown as PrismaClient,
      accountId: 999,
      newUserId: 20,
    });

    expect(result).toEqual({ ok: false, error: 'account_not_found' });
    expect(db.account.update).not.toHaveBeenCalled();
    expect(logEventMock).not.toHaveBeenCalled();
  });

  it('returns user_not_found when the target user does not exist', async () => {
    const currentOwner = makeUser({ id: 10 });
    const account = { ...makeAccount(), user: currentOwner };
    const db = makeDbMock({ account, newUser: null });

    const result = await moveAccountOwnership({
      db: db as unknown as PrismaClient,
      accountId: 1,
      newUserId: 99,
    });

    expect(result).toEqual({ ok: false, error: 'user_not_found' });
    expect(db.account.update).not.toHaveBeenCalled();
    expect(logEventMock).not.toHaveBeenCalled();
  });

  it('returns user_not_approved for a pending target user', async () => {
    const currentOwner = makeUser({ id: 10 });
    const newOwner = makeUser({ id: 20, status: 'pending' });
    const account = { ...makeAccount(), user: currentOwner };
    const db = makeDbMock({ account, newUser: newOwner });

    const result = await moveAccountOwnership({
      db: db as unknown as PrismaClient,
      accountId: 1,
      newUserId: 20,
    });

    expect(result).toEqual({ ok: false, error: 'user_not_approved' });
    expect(db.account.update).not.toHaveBeenCalled();
  });

  it('returns user_not_approved for a banned target user', async () => {
    const currentOwner = makeUser({ id: 10 });
    const newOwner = makeUser({ id: 20, status: 'banned' });
    const account = { ...makeAccount(), user: currentOwner };
    const db = makeDbMock({ account, newUser: newOwner });

    const result = await moveAccountOwnership({
      db: db as unknown as PrismaClient,
      accountId: 1,
      newUserId: 20,
    });

    expect(result).toEqual({ ok: false, error: 'user_not_approved' });
  });

  it('returns same_owner when the new owner already owns the account', async () => {
    const currentOwner = makeUser({ id: 10 });
    const account = { ...makeAccount({ user_id: 10 }), user: currentOwner };
    const db = makeDbMock({ account, newUser: currentOwner });

    const result = await moveAccountOwnership({
      db: db as unknown as PrismaClient,
      accountId: 1,
      newUserId: 10,
    });

    expect(result).toEqual({ ok: false, error: 'same_owner' });
    expect(db.account.update).not.toHaveBeenCalled();
  });
});
