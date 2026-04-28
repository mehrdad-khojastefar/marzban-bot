import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, handleApiError } from '@/panel/lib/server/middleware';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    return NextResponse.json(session);
  } catch (err) {
    return handleApiError(err);
  }
}
