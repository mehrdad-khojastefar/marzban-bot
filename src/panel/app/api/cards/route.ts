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

    const cards = await db.bankCard.findMany({
      select: {
        id: true,
        card_number: true,
        holder_name: true,
        bank_name: true,
        is_active: true,
        _count: {
          select: { users: true },
        },
        transactions: {
          where: { status: 'completed' },
          select: { amount: true },
        },
      },
      orderBy: { id: 'desc' },
    });

    const data = cards.map((card) => ({
      id: card.id,
      cardNumber: card.card_number.slice(-4),
      holderName: card.holder_name,
      bankName: card.bank_name,
      isActive: card.is_active,
      assignedUserCount: card._count.users,
      totalRevenue: card.transactions.reduce((sum, t) => sum + t.amount, 0),
    }));

    return NextResponse.json(serializeBigInt({ data }));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const { cardNumber, holderName, bankName } = await request.json();

    if (!cardNumber || !holderName) {
      return NextResponse.json(
        { error: 'cardNumber and holderName are required' },
        { status: 400 },
      );
    }

    const card = await db.bankCard.create({
      data: {
        card_number: cardNumber,
        holder_name: holderName,
        bank_name: bankName ?? null,
      },
    });

    return NextResponse.json(serializeBigInt({ data: card }), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
