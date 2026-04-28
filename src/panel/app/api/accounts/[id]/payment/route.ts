import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const { id } = await params;

    const account = await db.account.findUnique({ where: { id: parseInt(id) } });
    if (!account) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const newStatus = account.payment_status === 'paid' ? 'unpaid' : 'paid';
    await db.account.update({
      where: { id: parseInt(id) },
      data: { payment_status: newStatus },
    });

    return NextResponse.json({ paymentStatus: newStatus });
  } catch (err) {
    return handleApiError(err);
  }
}
