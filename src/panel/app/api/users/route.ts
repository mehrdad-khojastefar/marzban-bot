import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';
import { serializeBigInt } from '@/panel/lib/utils';

export async function GET(request: NextRequest) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? '';
    const page = parseInt(url.searchParams.get('page') ?? '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '10');

    const where: Record<string, unknown> = {};
    if (search) {
      const chatIdNum = /^\d+$/.test(search) ? BigInt(search) : undefined;
      where.OR = [
        { first_name: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        ...(chatIdNum !== undefined ? [{ chat_id: chatIdNum }] : []),
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          chat_id: true,
          username: true,
          first_name: true,
          last_name: true,
          plan_group_id: true,
          has_test: true,
          created_at: true,
          _count: {
            select: {
              accounts: true,
              transactions: true,
            },
          },
        },
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.user.count({ where }),
    ]);

    const data = users.map((user) => ({
      id: user.id,
      chatId: user.chat_id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      planGroupId: user.plan_group_id,
      hasTest: user.has_test,
      createdAt: user.created_at,
      accountCount: user._count.accounts,
      transactionCount: user._count.transactions,
    }));

    return NextResponse.json(serializeBigInt({ data, total, page, pageSize }));
  } catch (err) {
    return handleApiError(err);
  }
}
