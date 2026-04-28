import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';
import { serializeBigInt } from '@/panel/lib/utils';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();

    const groups = await db.planGroup.findMany({
      include: {
        plans: {
          select: {
            id: true,
            name: true,
            data_limit: true,
            duration_days: true,
            price: true,
            is_active: true,
          },
        },
        _count: {
          select: { users: true },
        },
      },
      orderBy: { id: 'desc' },
    });

    const data = groups.map((group) => ({
      id: group.id,
      code: group.code,
      name: group.name,
      type: group.type,
      pricePerGb: group.price_per_gb,
      durationDays: group.duration_days,
      isActive: group.is_active,
      createdAt: group.created_at,
      userCount: group._count.users,
      plans: group.plans,
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
    const { name, type, pricePerGb, durationDays } = await request.json();

    if (!name || !type) {
      return NextResponse.json(
        { error: 'name and type are required' },
        { status: 400 },
      );
    }

    if (type === 'per_gb' && (pricePerGb === undefined || pricePerGb === null)) {
      return NextResponse.json(
        { error: 'pricePerGb is required for per_gb type' },
        { status: 400 },
      );
    }

    const code = crypto.randomBytes(4).toString('hex').slice(0, 8);

    const group = await db.planGroup.create({
      data: {
        code,
        name,
        type,
        price_per_gb: type === 'per_gb' ? pricePerGb : null,
        duration_days: durationDays ?? 30,
      },
    });

    return NextResponse.json(serializeBigInt({ data: group }), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
