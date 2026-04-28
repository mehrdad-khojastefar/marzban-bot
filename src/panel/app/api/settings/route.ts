import { NextRequest, NextResponse } from 'next/server';
import { ensureBootstrap } from '@/panel/lib/server/bootstrap';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';
import { getDb } from '@/core/db';

export async function GET(request: NextRequest) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const settings = await db.botSetting.findMany();
    return NextResponse.json(settings);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    ensureBootstrap();
    await requireAuth(request);
    const db = getDb();
    const { key, value } = await request.json();

    const setting = await db.botSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    return NextResponse.json(setting);
  } catch (err) {
    return handleApiError(err);
  }
}
