import useSWR from 'swr';
import { api } from '@/panel/lib/api';
import type { PaginatedResponse, TransactionRow } from '@/panel/types';

export function useTransactions(status?: string, method?: string, page = 1) {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  if (method && method !== 'all') params.set('method', method);
  params.set('page', String(page));

  return useSWR<PaginatedResponse<TransactionRow>>(
    `/api/transactions?${params.toString()}`,
    api,
  );
}
