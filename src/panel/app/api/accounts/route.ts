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
    const filter = url.searchParams.get('filter') ?? 'all';
    const search = url.searchParams.get('search') ?? '';
    const page = parseInt(url.searchParams.get('page') ?? '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '10');

    const where: any = {};
    if (filter === 'paid') where.payment_status = 'paid';
    if (filter === 'unpaid') where.payment_status = 'unpaid';
    if (search) {
      where.OR = [
        { marzban_username: { contains: search, mode: 'insensitive' } },
        { note: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [accounts, total] = await Promise.all([
      db.account.findMany({
        where,
        include: {
          seller: { select: { id: true, note: true } },
          seller_plan: { select: { name: true } },
          plan: { select: { name: true } },
          user: { select: { first_name: true, username: true } },
        },
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.account.count({ where }),
    ]);

    return NextResponse.json(serializeBigInt({ data: accounts, total, page, pageSize }));
  } catch (err) {
    return handleApiError(err);
  }
}
