import useSWR from 'swr';
import { api } from '@/panel/lib/api';
import type { PaginatedResponse, UserRow } from '@/panel/types';

export function useUsers(search?: string, page = 1) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  params.set('page', String(page));

  return useSWR<PaginatedResponse<UserRow>>(
    `/api/users?${params.toString()}`,
    api,
  );
}
