import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { BotContext, ViewedAccountCache } from '../../context'
import { ensureViewedAccount, clearViewedAccount } from '../adminViewAccount'

type SessionPart = {
  selectedAccountId?: number
  viewedAccount?: ViewedAccountCache
}

function makeCtx(session: SessionPart): BotContext {
  return { session } as unknown as BotContext
}

function makeDb(row: ViewedAccountCache | null): {
  db: PrismaClient
  findUnique: ReturnType<typeof vi.fn>
} {
  const findUnique = vi.fn().mockResolvedValue(row)
  const db = {
    account: { findUnique },
  } as unknown as PrismaClient
  return { db, findUnique }
}

const acc1: ViewedAccountCache = {
  id: 1,
  marzban_username: 'user1',
  payment_status: 'paid',
  seller_id: 7,
  seller_plan_id: 3,
}

const acc2: ViewedAccountCache = {
  id: 2,
  marzban_username: 'user2',
  payment_status: 'unpaid',
  seller_id: 8,
  seller_plan_id: 4,
}

describe('ensureViewedAccount', () => {
  it('returns null when selectedAccountId is missing', async () => {
    const ctx = makeCtx({})
    const { db, findUnique } = makeDb(null)
    const result = await ensureViewedAccount(ctx, db)
    expect(result).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('fetches from DB on first call and caches the result', async () => {
    const ctx = makeCtx({ selectedAccountId: 1 })
    const { db, findUnique } = makeDb(acc1)
    const result = await ensureViewedAccount(ctx, db)
    expect(result).toEqual(acc1)
    expect(findUnique).toHaveBeenCalledTimes(1)
    expect(ctx.session.viewedAccount).toEqual(acc1)
  })

  it('returns cached value on subsequent calls without hitting DB', async () => {
    const ctx = makeCtx({ selectedAccountId: 1, viewedAccount: acc1 })
    const { db, findUnique } = makeDb(acc1)
    await ensureViewedAccount(ctx, db)
    await ensureViewedAccount(ctx, db)
    await ensureViewedAccount(ctx, db)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('re-fetches when selectedAccountId changes', async () => {
    const ctx = makeCtx({ selectedAccountId: 1, viewedAccount: acc1 })
    const { db, findUnique } = makeDb(acc2)
    ctx.session.selectedAccountId = 2
    const result = await ensureViewedAccount(ctx, db)
    expect(result).toEqual(acc2)
    expect(findUnique).toHaveBeenCalledTimes(1)
    expect(ctx.session.viewedAccount).toEqual(acc2)
  })

  it('keeps the previous cache when DB returns null', async () => {
    const ctx = makeCtx({ selectedAccountId: 9, viewedAccount: acc1 })
    const { db } = makeDb(null)
    const result = await ensureViewedAccount(ctx, db)
    expect(result).toBeNull()
    // ctx.session.viewedAccount is intentionally not overwritten with null
    // (cache remains so back-navigation can still surface a label).
    expect(ctx.session.viewedAccount).toEqual(acc1)
  })

  it('uses a slim select shape (no relation includes)', async () => {
    const ctx = makeCtx({ selectedAccountId: 1 })
    const { db, findUnique } = makeDb(acc1)
    await ensureViewedAccount(ctx, db)
    const callArg = findUnique.mock.calls[0][0] as {
      where: { id: number }
      select: Record<string, true>
    }
    expect(callArg.where).toEqual({ id: 1 })
    expect(callArg.select).toEqual({
      id: true,
      marzban_username: true,
      payment_status: true,
      seller_id: true,
      seller_plan_id: true,
    })
  })
})

describe('clearViewedAccount', () => {
  it('removes the cached account from the session', () => {
    const ctx = makeCtx({ selectedAccountId: 1, viewedAccount: acc1 })
    clearViewedAccount(ctx)
    expect(ctx.session.viewedAccount).toBeUndefined()
  })
})
