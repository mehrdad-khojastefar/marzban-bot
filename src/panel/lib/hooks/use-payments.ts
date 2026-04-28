import useSWR from 'swr';
import { api } from '@/panel/lib/api';

export function usePayments(status = 'awaiting_approval') {
  return useSWR(`/api/payments?status=${status}`, api, {
    refreshInterval: 15000,
  });
}
