import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './auth';
import type { AdminSession } from '@/panel/types';

export async function requireAuth(request: NextRequest): Promise<AdminSession> {
  const cookie = request.cookies.get('doves_token');
  if (!cookie?.value) {
    throw new AuthError('Not authenticated');
  }

  try {
    return await verifyToken(cookie.value);
  } catch {
    throw new AuthError('Invalid token');
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  console.error('API error:', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
