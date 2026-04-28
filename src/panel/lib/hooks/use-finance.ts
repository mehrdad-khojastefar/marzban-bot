import useSWR from 'swr';
import { api } from '@/panel/lib/api';
import type { FinanceData } from '@/panel/types';

export function useFinance() {
  return useSWR<FinanceData>('/api/dashboard/finance', api, {
    refreshInterval: 60000,
  });
}
