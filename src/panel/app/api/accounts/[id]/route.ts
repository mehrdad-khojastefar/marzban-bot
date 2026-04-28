import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';
import { getMarzban } from '@/core/marzban';
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

    const account = await db.account.findUnique({
      where: { id: parseInt(id) },
      include: {
        seller: { select: { id: true, note: true, link_prefix: true } },
        seller_plan: true,
        plan: true,
        user: { select: { first_name: true, username: true, chat_id: true } },
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(serializeBigInt(account));
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
    const marzban = getMarzban();
    const { id } = await params;
    const body = await request.json();

    const account = await db.account.findUnique({ where: { id: parseInt(id) } });
    if (!account) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const dbData: Record<string, unknown> = {};
    const marzbanData: Record<string, unknown> = {};

    if ('note' in body) dbData.note = body.note;
    if ('price' in body) dbData.price = body.price;

    if ('dataLimit' in body) {
      dbData.data_limit = BigInt(body.dataLimit);
      marzbanData.data_limit = body.dataLimit;
    }

    if ('expire' in body) {
      const expireDate = new Date(body.expire);
      dbData.expires_at = expireDate;
      marzbanData.expire = Math.floor(expireDate.getTime() / 1000);
    }

    if (Object.keys(marzbanData).length) {
      await marzban.modifyUser(account.marzban_username, marzbanData);
    }

    const updated = await db.account.update({
      where: { id: parseInt(id) },
      data: dbData,
    });

    return NextResponse.json(serializeBigInt(updated));
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
    const marzban = getMarzban();
    const { id } = await params;

    const account = await db.account.findUnique({ where: { id: parseInt(id) } });
    if (!account) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    try {
      await marzban.removeUser(account.marzban_username);
    } catch {
      // Marzban user might already be deleted
    }

    await db.account.delete({ where: { id: parseInt(id) } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
