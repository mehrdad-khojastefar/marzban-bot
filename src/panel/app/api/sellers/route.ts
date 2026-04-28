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

    const sellers = await db.seller.findMany({
      include: {
        user: { select: { first_name: true, username: true } },
        accounts: {
          where: { payment_status: 'unpaid' },
          select: { price: true },
        },
        _count: { select: { accounts: true } },
      },
      orderBy: { id: 'desc' },
    });

    const data = sellers.map((s) => ({
      id: s.id,
      chatId: s.chat_id.toString(),
      userId: s.user_id,
      note: s.note,
      linkPrefix: s.link_prefix,
      isActive: s.is_active,
      userName: s.user?.first_name ?? null,
      userUsername: s.user?.username ?? null,
      totalDebt: s.accounts.reduce((sum, a) => sum + (a.price ?? 0), 0),
      accountCount: s._count.accounts,
    }));

    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const { chatId } = await request.json();

    if (!chatId) {
      return NextResponse.json({ error: 'chatId required' }, { status: 400 });
    }

    const existing = await db.seller.findUnique({
      where: { chat_id: BigInt(chatId) },
    });
    if (existing) {
      return NextResponse.json({ error: 'Seller already exists' }, { status: 409 });
    }

    // Link to user if they already exist
    const user = await db.user.findUnique({
      where: { chat_id: BigInt(chatId) },
    });

    const seller = await db.seller.create({
      data: {
        chat_id: BigInt(chatId),
        user_id: user?.id ?? null,
      },
    });

    return NextResponse.json(serializeBigInt(seller), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
