import { NextRequest, NextResponse } from 'next/server';
import { verifyTelegramAuth, isAdmin, createToken } from '@/panel/lib/server/auth';
import { handleApiError } from '@/panel/lib/server/middleware';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = body as Record<string, string>;

    if (!verifyTelegramAuth(data)) {
      return NextResponse.json({ error: 'Invalid Telegram auth' }, { status: 401 });
    }

    if (!isAdmin(data.id)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const token = await createToken({
      chatId: data.id,
      username: data.username ?? '',
      firstName: data.first_name ?? '',
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set('doves_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
