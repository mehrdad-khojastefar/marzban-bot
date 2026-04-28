import useSWR from 'swr';
import { api } from '@/panel/lib/api';
import type { DashboardStats } from '@/panel/types';

export function useDashboardStats() {
  return useSWR<DashboardStats>('/api/dashboard/stats', api, {
    refreshInterval: 30000,
  });
}
