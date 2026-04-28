import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const { id } = await params;
    const { accountIds, all } = await request.json();

    const where: Record<string, unknown> = {
      seller_id: parseInt(id),
      payment_status: 'unpaid',
    };

    if (!all && accountIds?.length) {
      where.id = { in: accountIds };
    }

    const result = await db.account.updateMany({
      where,
      data: { payment_status: 'paid' },
    });

    return NextResponse.json({ settled: result.count });
  } catch (err) {
    return handleApiError(err);
  }
}
