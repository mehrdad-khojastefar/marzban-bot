import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';
import { serializeBigInt } from '@/panel/lib/utils';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const { id } = await params;

    const card = await db.bankCard.findUnique({
      where: { id: parseInt(id) },
    });

    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    const updated = await db.bankCard.update({
      where: { id: parseInt(id) },
      data: { is_active: !card.is_active },
    });

    return NextResponse.json(serializeBigInt({ data: updated }));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const { id } = await params;
    const cardId = parseInt(id);

    const assignedUsers = await db.user.count({
      where: { bank_card_id: cardId },
    });

    if (assignedUsers > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete card with assigned users',
          assignedUsers,
        },
        { status: 409 },
      );
    }

    await db.bankCard.delete({ where: { id: cardId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
