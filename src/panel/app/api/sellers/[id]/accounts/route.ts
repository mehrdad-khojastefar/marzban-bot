import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';
import { serializeBigInt } from '@/panel/lib/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const { id } = await params;
    const url = new URL(request.url);
    const filter = url.searchParams.get('filter') ?? 'all';
    const page = parseInt(url.searchParams.get('page') ?? '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '10');

    const where: Record<string, unknown> = { seller_id: parseInt(id) };
    if (filter === 'paid') where.payment_status = 'paid';
    if (filter === 'unpaid') where.payment_status = 'unpaid';

    const [accounts, total] = await Promise.all([
      db.account.findMany({
        where,
        include: { seller_plan: { select: { name: true } } },
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.account.count({ where }),
    ]);

    return NextResponse.json(
      serializeBigInt({ data: accounts, total, page, pageSize }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
