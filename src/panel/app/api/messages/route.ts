import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';

export async function GET(request: NextRequest) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const messages = await db.botMessage.findMany({ orderBy: { key: 'asc' } });
    return NextResponse.json(messages);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const { key, text } = await request.json();

    const message = await db.botMessage.update({
      where: { key },
      data: { text },
    });

    return NextResponse.json(message);
  } catch (err) {
    return handleApiError(err);
  }
}
