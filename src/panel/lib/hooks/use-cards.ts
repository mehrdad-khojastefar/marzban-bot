import useSWR from 'swr';
import { api } from '@/panel/lib/api';
import type { CardRow } from '@/panel/types';

export function useCards() {
  return useSWR<CardRow[]>('/api/cards', api);
}
