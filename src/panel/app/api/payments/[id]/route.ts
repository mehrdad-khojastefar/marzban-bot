import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';
import { getMarzban, buildProxiesAndInbounds } from '@/core/marzban';
import { extractSubToken } from '@/core/utils/format';
import { loadPanelEnv } from '@/panel/lib/server/env';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    ensureBootstrap();
    const admin = await requireAuth(request);
    const db = getDb();
    const { id } = await params;
    const { action } = await request.json();

    const payment = await db.payment.findUnique({
      where: { id: parseInt(id) },
      include: { user: true, plan: true },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (action === 'reject') {
      await db.payment.update({
        where: { id: parseInt(id) },
        data: {
          status: 'rejected',
          reviewed_by: BigInt(admin.chatId),
        },
      });
      return NextResponse.json({ ok: true, status: 'rejected' });
    }

    if (action === 'approve') {
      const marzban = getMarzban();
      const env = loadPanelEnv();
      const username = 'a_' + crypto.randomBytes(3).toString('hex').slice(0, 6);
      const expireTimestamp =
        Math.floor(Date.now() / 1000) + payment.plan.duration_days * 24 * 60 * 60;

      const { proxies, inbounds } = await buildProxiesAndInbounds();

      const marzbanUser = await marzban.addUser({
        username,
        proxies,
        inbounds,
        data_limit: Number(payment.plan.data_limit),
        expire: expireTimestamp,
        status: 'active',
      });

      await db.account.create({
        data: {
          user_id: payment.user_id,
          plan_id: payment.plan_id,
          marzban_username: username,
          marzban_sub_token: extractSubToken(marzbanUser.subscription_url),
          type: 'paid',
          payment_status: 'paid',
          price: payment.amount,
          expires_at: new Date(expireTimestamp * 1000),
        },
      });

      await db.payment.update({
        where: { id: parseInt(id) },
        data: {
          status: 'approved',
          reviewed_by: BigInt(admin.chatId),
        },
      });

      return NextResponse.json({ ok: true, status: 'approved' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return handleApiError(err);
  }
}
