import { fetchTomanPerUsdFromNobitex } from './nobitex';

const CACHE_TTL_MS = 5 * 60 * 1000;

export class FxUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'FxUnavailableError';
  }
}

export interface FxRate {
  /** Toman per 1 USD. */
  tomanPerUsd: number;
  source: string;
  fetchedAt: Date;
}

export interface TomanToUsdResult {
  /** USD amount, rounded to 2 decimals. */
  usd: number;
  rate: FxRate;
}

interface CacheEntry {
  rate: FxRate;
  expiresAt: number;
}

let cache: CacheEntry | null = null;
let inflight: Promise<FxRate> | null = null;

export function invalidateFxCache(): void {
  cache = null;
  inflight = null;
}

async function loadRate(): Promise<FxRate> {
  try {
    const tomanPerUsd = await fetchTomanPerUsdFromNobitex();
    return { tomanPerUsd, source: 'nobitex', fetchedAt: new Date() };
  } catch (err) {
    throw new FxUnavailableError('Failed to fetch FX rate from Nobitex', err);
  }
}

export async function getTomanPerUsd(): Promise<FxRate> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.rate;
  }
  if (inflight) {
    return inflight;
  }
  inflight = loadRate()
    .then((rate) => {
      cache = { rate, expiresAt: Date.now() + CACHE_TTL_MS };
      inflight = null;
      return rate;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

/**
 * Convert a Toman amount to USD using the current cached rate.
 * USD is rounded to 2 decimal places (NowPayments invoice precision).
 */
export async function tomanToUsd(toman: number): Promise<TomanToUsdResult> {
  if (!Number.isFinite(toman) || toman <= 0) {
    throw new Error(`tomanToUsd: invalid toman amount: ${String(toman)}`);
  }
  const rate = await getTomanPerUsd();
  const raw = toman / rate.tomanPerUsd;
  const usd = Math.round(raw * 100) / 100;
  return { usd, rate };
}
