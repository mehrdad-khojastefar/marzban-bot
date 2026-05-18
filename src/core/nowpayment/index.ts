import { NowpaymentClient } from './client';
import { loadEnv } from '../utils/config';

let cached: NowpaymentClient | null = null;

/** Lazily build a singleton NowpaymentClient from env. */
export function getNowpaymentClient(): NowpaymentClient {
  if (cached) return cached;
  const env = loadEnv();
  if (!env.NOWPAYMENTS_API_KEY || !env.NOWPAYMENTS_IPN_SECRET) {
    throw new Error('NowPayments not configured: NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET are required');
  }
  cached = new NowpaymentClient({
    apiKey: env.NOWPAYMENTS_API_KEY,
    ipnSecret: env.NOWPAYMENTS_IPN_SECRET,
    sandbox: env.NOWPAYMENTS_SANDBOX === 'true',
  });
  return cached;
}

export function resetNowpaymentClient(): void {
  cached = null;
}

export * from './client';
export * from './service';
export * from './types';
