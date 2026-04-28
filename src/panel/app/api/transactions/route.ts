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
    const status = url.searchParams.get('status');
    const method = url.searchParams.get('method');
    const page = parseInt(url.searchParams.get('page') ?? '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '10');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (method) where.method = method;

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where,
        include: {
          user: { select: { first_name: true, username: true } },
          plan: { select: { name: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.transaction.count({ where }),
    ]);

    return NextResponse.json(
      serializeBigInt({ data: transactions, total, page, pageSize }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
