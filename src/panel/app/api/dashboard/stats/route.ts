import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';

export async function GET(request: NextRequest) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();

    const now = new Date();

    const [
      totalUsers,
      totalAccounts,
      activeAccounts,
      totalSellers,
      debtAgg,
      pendingPayments,
    ] = await Promise.all([
      db.user.count(),
      db.account.count(),
      db.account.count({ where: { expires_at: { gt: now } } }),
      db.seller.count(),
      db.account.aggregate({
        where: { payment_status: 'unpaid' },
        _sum: { price: true },
      }),
      db.payment.count({ where: { status: 'awaiting_approval' } }),
    ]);

    return NextResponse.json({
      totalUsers,
      totalAccounts,
      activeAccounts,
      totalSellers,
      totalDebt: debtAgg._sum.price ?? 0,
      pendingPayments,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
