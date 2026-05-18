import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  claimTransactionForProvisioning,
  markTransactionFailed,
  ProvisionConflictError,
} from '../provision';

function makeDb(handlers: {
  updateMany?: ReturnType<typeof vi.fn>;
  findUnique?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}): {
  db: PrismaClient;
  updateMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
} {
  const updateMany = handlers.updateMany ?? vi.fn().mockResolvedValue({ count: 0 });
  const findUnique = handlers.findUnique ?? vi.fn().mockResolvedValue(null);
  const update = handlers.update ?? vi.fn().mockResolvedValue({});
  const db = {
    transaction: { updateMany, findUnique, update },
  } as unknown as PrismaClient;
  return { db, updateMany, findUnique, update };
}

describe('claimTransactionForProvisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claims a pending transaction (updateMany affects one row)', async () => {
    const { db, updateMany, findUnique } = makeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    });
    const outcome = await claimTransactionForProvisioning(db, 42);
    expect(outcome).toEqual({ kind: 'claimed' });
    expect(findUnique).not.toHaveBeenCalled();
    const args = updateMany.mock.calls[0][0] as {
      where: { id: number; status: { in: string[] } };
      data: { status: string };
    };
    expect(args.where.id).toBe(42);
    expect(args.where.status.in).toEqual(
      expect.arrayContaining(['pending', 'paid', 'awaiting_approval', 'checkout', 'failed']),
    );
    expect(args.data.status).toBe('provisioning');
  });

  it('returns already_completed when the txn is in terminal completed state', async () => {
    const { db, findUnique } = makeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue({ status: 'completed', account_id: 99 }),
    });
    const outcome = await claimTransactionForProvisioning(db, 42);
    expect(outcome).toEqual({ kind: 'already_completed', accountId: 99 });
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it('throws ProvisionConflictError when status is provisioning (in flight)', async () => {
    const { db } = makeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue({ status: 'provisioning', account_id: null }),
    });
    await expect(claimTransactionForProvisioning(db, 42)).rejects.toBeInstanceOf(
      ProvisionConflictError,
    );
  });

  it('throws ProvisionConflictError when status is rejected', async () => {
    const { db } = makeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue({ status: 'rejected', account_id: null }),
    });
    await expect(claimTransactionForProvisioning(db, 42)).rejects.toMatchObject({
      name: 'ProvisionConflictError',
      currentStatus: 'rejected',
    });
  });

  it('throws ProvisionConflictError when completed but missing account_id', async () => {
    // Inconsistent state — treat as conflict so the caller doesn't pretend success.
    const { db } = makeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue({ status: 'completed', account_id: null }),
    });
    await expect(claimTransactionForProvisioning(db, 42)).rejects.toBeInstanceOf(
      ProvisionConflictError,
    );
  });

  it('throws a plain Error when the transaction does not exist', async () => {
    const { db } = makeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue(null),
    });
    await expect(claimTransactionForProvisioning(db, 42)).rejects.toThrow(
      /Transaction 42 not found/,
    );
  });

  it('claims a transaction in the failed state (retry-safe with new atomic design)', async () => {
    // With the new design, account.create + transaction.update are in one
    // $transaction. A `failed` state therefore never has an Account row
    // linked, so the retry just generates a fresh Marzban username; any
    // leftover Marzban user from the prior attempt is best-effort cleaned.
    const { db } = makeDb({
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    });
    const outcome = await claimTransactionForProvisioning(db, 42);
    expect(outcome).toEqual({ kind: 'claimed' });
  });
});

describe('markTransactionFailed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes status=failed and the error message', async () => {
    const update = vi.fn().mockResolvedValue({});
    const db = { transaction: { update } } as unknown as PrismaClient;
    await markTransactionFailed(db, 42, new Error('marzban exploded'));
    expect(update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'failed', error_message: 'marzban exploded' },
    });
  });

  it('stringifies non-Error values', async () => {
    const update = vi.fn().mockResolvedValue({});
    const db = { transaction: { update } } as unknown as PrismaClient;
    await markTransactionFailed(db, 42, 'a literal string');
    const call = update.mock.calls[0][0] as { data: { error_message: string } };
    expect(call.data.error_message).toBe('a literal string');
  });

  it('swallows update errors (best-effort)', async () => {
    const update = vi.fn().mockRejectedValue(new Error('db down'));
    const db = { transaction: { update } } as unknown as PrismaClient;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(markTransactionFailed(db, 42, new Error('boom'))).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
