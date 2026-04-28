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
    const status = url.searchParams.get('status') ?? 'awaiting_approval';

    const payments = await db.payment.findMany({
      where: { status: status as any },
      include: {
        user: { select: { first_name: true, username: true, chat_id: true } },
        plan: { select: { name: true, data_limit: true, duration_days: true, price: true } },
      },
      orderBy: { id: 'desc' },
    });

    return NextResponse.json(serializeBigInt(payments));
  } catch (err) {
    return handleApiError(err);
  }
}
