import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';
import { serializeBigInt } from '@/panel/lib/utils';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const { planId } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if ('isActive' in body) data.is_active = body.isActive;

    const plan = await db.sellerPlan.update({
      where: { id: parseInt(planId) },
      data,
    });

    return NextResponse.json(serializeBigInt(plan));
  } catch (err) {
    return handleApiError(err);
  }
}
