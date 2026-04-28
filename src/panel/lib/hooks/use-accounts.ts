import useSWR from 'swr';
import { api } from '@/panel/lib/api';

export function useAccounts(filter: string, search: string, page: number) {
  return useSWR(
    `/api/accounts?filter=${filter}&search=${encodeURIComponent(search)}&page=${page}`,
    api,
  );
}

export function useAccount(id: string) {
  return useSWR(`/api/accounts/${id}`, api);
}

export function useMarzbanStatus(id: string) {
  return useSWR(`/api/accounts/${id}/marzban`, api, {
    refreshInterval: 15000,
  });
}
