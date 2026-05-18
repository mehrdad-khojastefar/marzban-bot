import axios from 'axios';

const NOBITEX_URL = 'https://api.nobitex.ir/market/stats';
const REQUEST_TIMEOUT_MS = 10_000;

interface NobitexStatsResponse {
  status: string;
  stats?: Record<string, { latest?: string } | undefined>;
}

/**
 * Fetch the latest USDT/IRT price from Nobitex and convert to Toman per USDT.
 * Nobitex publishes prices in Rial; we divide by 10 to get Toman.
 * USDT is treated as USD (standard practice for Iran-side conversions).
 */
export async function fetchTomanPerUsdFromNobitex(): Promise<number> {
  const res = await axios.get<NobitexStatsResponse>(NOBITEX_URL, {
    params: { srcCurrency: 'usdt', dstCurrency: 'rls' },
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (res.data.status !== 'ok') {
    throw new Error(`Nobitex returned non-ok status: ${res.data.status}`);
  }

  const pair = res.data.stats?.['usdt-rls'];
  const latestStr = pair?.latest;
  if (!latestStr) {
    throw new Error('Nobitex response missing usdt-rls.latest');
  }

  const rial = Number(latestStr);
  if (!Number.isFinite(rial) || rial <= 0) {
    throw new Error(`Nobitex returned invalid rate: ${latestStr}`);
  }

  return rial / 10;
}
