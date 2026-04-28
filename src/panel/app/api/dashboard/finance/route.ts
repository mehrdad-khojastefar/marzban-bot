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

    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [
      revenueAgg,
      debtAgg,
      sellers,
      cards,
      recentTransactions,
      paidAccountsLast6Months,
    ] = await Promise.all([
      db.account.aggregate({
        where: { payment_status: 'paid' },
        _sum: { price: true },
      }),
      db.account.aggregate({
        where: { payment_status: 'unpaid' },
        _sum: { price: true },
      }),
      db.seller.findMany({
        select: {
          id: true,
          note: true,
          accounts: {
            select: {
              price: true,
              payment_status: true,
              expires_at: true,
            },
          },
        },
      }),
      db.bankCard.findMany({
        select: {
          id: true,
          card_number: true,
          holder_name: true,
          transactions: {
            where: { status: 'completed', bank_card_id: { not: null } },
            select: { amount: true },
          },
        },
      }),
      db.transaction.findMany({
        where: { status: 'completed' },
        include: {
          user: { select: { first_name: true, username: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
      db.account.findMany({
        where: {
          payment_status: 'paid',
          created_at: { gte: sixMonthsAgo },
        },
        select: { price: true, created_at: true },
      }),
    ]);

    const totalRevenue = revenueAgg._sum.price ?? 0;
    const totalDebt = debtAgg._sum.price ?? 0;

    const sellerBreakdown = sellers.map((seller) => {
      const totalAccounts = seller.accounts.length;
      const paidAmount = seller.accounts
        .filter((a) => a.payment_status === 'paid')
        .reduce((sum, a) => sum + (a.price ?? 0), 0);
      const unpaidDebt = seller.accounts
        .filter((a) => a.payment_status === 'unpaid')
        .reduce((sum, a) => sum + (a.price ?? 0), 0);
      const activeAccounts = seller.accounts.filter(
        (a) => a.expires_at > now,
      ).length;

      return {
        sellerId: seller.id,
        sellerName: seller.note ?? `Seller #${seller.id}`,
        totalAccounts,
        paidAmount,
        unpaidDebt,
        activeAccounts,
      };
    });

    const cardBreakdown = cards.map((card) => {
      const totalReceived = card.transactions.reduce(
        (sum, t) => sum + t.amount,
        0,
      );
      return {
        cardId: card.id,
        lastFour: card.card_number.slice(-4),
        holderName: card.holder_name,
        totalReceived,
        transactionCount: card.transactions.length,
      };
    });

    const monthlyRevenueMap = new Map<string, number>();
    for (const account of paidAccountsLast6Months) {
      const date = new Date(account.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenueMap.set(
        key,
        (monthlyRevenueMap.get(key) ?? 0) + (account.price ?? 0),
      );
    }

    const monthlyRevenue: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue.push({
        month: key,
        revenue: monthlyRevenueMap.get(key) ?? 0,
      });
    }

    return NextResponse.json(
      serializeBigInt({
        totalRevenue,
        totalDebt,
        sellerBreakdown,
        cardBreakdown,
        recentTransactions,
        monthlyRevenue,
      }),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
