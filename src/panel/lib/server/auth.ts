import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { loadPanelEnv } from './env';
import type { AdminSession } from '@/panel/types';

function getSecret(): Uint8Array {
  const env = loadPanelEnv();
  return new TextEncoder().encode(env.ADMIN_SECRET);
}

export function verifyTelegramAuth(data: Record<string, string>): boolean {
  const env = loadPanelEnv();
  const { hash, ...rest } = data;
  if (!hash) return false;

  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n');

  const secretKey = crypto
    .createHash('sha256')
    .update(env.TELEGRAM_BOT_TOKEN)
    .digest();

  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  if (hmac !== hash) return false;

  // Check auth_date is within 1 day
  const authDate = parseInt(data.auth_date ?? '0');
  if (Date.now() / 1000 - authDate > 86400) return false;

  return true;
}

export function isAdmin(chatId: string): boolean {
  const env = loadPanelEnv();
  return chatId === env.ADMIN_CHAT_ID;
}

export async function createToken(session: AdminSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<AdminSession> {
  const { payload } = await jwtVerify(token, getSecret());
  return {
    chatId: payload.chatId as string,
    username: payload.username as string,
    firstName: payload.firstName as string,
  };
}
