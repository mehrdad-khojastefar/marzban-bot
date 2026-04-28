import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';
import { getMarzban } from '@/core/marzban';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const marzban = getMarzban();
    const { id } = await params;
    const { status } = await request.json();

    const account = await db.account.findUnique({ where: { id: parseInt(id) } });
    if (!account) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await marzban.modifyUser(account.marzban_username, { status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
