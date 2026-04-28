import useSWR from 'swr';
import { api } from '@/panel/lib/api';
import type { SellerWithDebt } from '@/panel/types';

export function useSellers() {
  return useSWR<SellerWithDebt[]>('/api/sellers', api);
}

export function useSeller(id: string) {
  return useSWR(`/api/sellers/${id}`, api);
}

export function useSellerPlans(sellerId: string) {
  return useSWR(`/api/sellers/${sellerId}/plans`, api);
}

export function useSellerAccounts(
  sellerId: string,
  filter: string,
  page: number,
) {
  return useSWR(
    `/api/sellers/${sellerId}/accounts?filter=${filter}&page=${page}`,
    api,
  );
}
