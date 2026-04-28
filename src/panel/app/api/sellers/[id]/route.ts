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

    const seller = await db.seller.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: { select: { first_name: true, last_name: true, username: true } },
        _count: { select: { accounts: true, plans: true } },
      },
    });

    if (!seller) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Calculate debt
    const debtAgg = await db.account.aggregate({
      where: { seller_id: seller.id, payment_status: 'unpaid' },
      _sum: { price: true },
    });

    const activeAccounts = await db.account.count({
      where: { seller_id: seller.id, expires_at: { gt: new Date() } },
    });

    return NextResponse.json(
      serializeBigInt({
        ...seller,
        totalDebt: debtAgg._sum.price ?? 0,
        activeAccounts,
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if ('note' in body) data.note = body.note;
    if ('linkPrefix' in body) data.link_prefix = body.linkPrefix;
    if ('isActive' in body) data.is_active = body.isActive;

    const seller = await db.seller.update({
      where: { id: parseInt(id) },
      data,
    });

    return NextResponse.json(serializeBigInt(seller));
  } catch (err) {
    return handleApiError(err);
  }
}
