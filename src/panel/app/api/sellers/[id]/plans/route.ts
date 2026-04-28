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

    const plans = await db.sellerPlan.findMany({
      where: { seller_id: parseInt(id) },
      orderBy: { id: 'desc' },
    });

    return NextResponse.json(serializeBigInt(plans));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const { id } = await params;
    const { name, type, dataLimit, price } = await request.json();

    if (!name || !type || !dataLimit || !price) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 });
    }

    const plan = await db.sellerPlan.create({
      data: {
        seller_id: parseInt(id),
        name,
        type,
        data_limit: BigInt(dataLimit),
        price,
      },
    });

    return NextResponse.json(serializeBigInt(plan), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
