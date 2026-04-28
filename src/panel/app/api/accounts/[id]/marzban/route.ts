import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';
import { getMarzban } from '@/core/marzban';

export async function GET(
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
      const marzbanUser = await marzban.getUser(account.marzban_username);
      return NextResponse.json({
        status: marzbanUser.status,
        usedTraffic: marzbanUser.used_traffic,
        dataLimit: marzbanUser.data_limit,
        subscriptionUrl: marzbanUser.subscription_url,
        online: marzbanUser.online_at != null,
      });
    } catch {
      return NextResponse.json({
        status: 'unknown',
        usedTraffic: 0,
        dataLimit: 0,
        subscriptionUrl: '',
        online: false,
        error: 'Marzban unreachable',
      });
    }
  } catch (err) {
    return handleApiError(err);
  }
}
