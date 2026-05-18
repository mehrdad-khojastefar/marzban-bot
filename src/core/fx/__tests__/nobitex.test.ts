import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { fetchTomanPerUsdFromNobitex } from '../nobitex';
import { tomanToUsd, invalidateFxCache, FxUnavailableError } from '../index';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);

function mockOkResponse(rial: string) {
  mockedAxios.get.mockResolvedValue({
    data: { status: 'ok', stats: { 'usdt-rls': { latest: rial } } },
  } as never);
}

describe('fetchTomanPerUsdFromNobitex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateFxCache();
  });

  it('parses latest rial value and returns Toman per USD', async () => {
    mockOkResponse('800000');
    const rate = await fetchTomanPerUsdFromNobitex();
    expect(rate).toBe(80000);
  });

  it('throws when Nobitex returns non-ok status', async () => {
    mockedAxios.get.mockResolvedValue({ data: { status: 'failed' } } as never);
    await expect(fetchTomanPerUsdFromNobitex()).rejects.toThrow(/non-ok status/);
  });

  it('throws when usdt-rls.latest is missing', async () => {
    mockedAxios.get.mockResolvedValue({ data: { status: 'ok', stats: {} } } as never);
    await expect(fetchTomanPerUsdFromNobitex()).rejects.toThrow(/missing usdt-rls/);
  });

  it('throws when latest is non-numeric', async () => {
    mockOkResponse('not-a-number');
    await expect(fetchTomanPerUsdFromNobitex()).rejects.toThrow(/invalid rate/);
  });
});

describe('tomanToUsd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateFxCache();
  });

  it('converts toman to USD using fetched rate', async () => {
    mockOkResponse('800000'); // 80,000 toman per USD
    const result = await tomanToUsd(160_000);
    expect(result.usd).toBe(2);
    expect(result.rate.source).toBe('nobitex');
    expect(result.rate.tomanPerUsd).toBe(80000);
  });

  it('rounds USD to 2 decimal places', async () => {
    mockOkResponse('800000');
    const result = await tomanToUsd(123_456);
    // 123456 / 80000 = 1.5432 → 1.54
    expect(result.usd).toBe(1.54);
  });

  it('caches the rate and does not refetch on second call', async () => {
    mockOkResponse('800000');
    await tomanToUsd(100_000);
    await tomanToUsd(200_000);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('rejects non-positive amounts', async () => {
    await expect(tomanToUsd(0)).rejects.toThrow(/invalid toman/);
    await expect(tomanToUsd(-5)).rejects.toThrow(/invalid toman/);
  });

  it('wraps fetch errors in FxUnavailableError', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network down') as never);
    await expect(tomanToUsd(100_000)).rejects.toBeInstanceOf(FxUnavailableError);
  });
});
