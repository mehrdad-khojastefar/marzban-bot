'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAccounts } from '@/panel/lib/hooks/use-accounts';
import { SearchInput } from '@/panel/components/shared/search-input';
import { FilterTabs } from '@/panel/components/shared/filter-tabs';
import { EmptyState } from '@/panel/components/shared/empty-state';

export default function AccountsPage() {
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAccounts(filter, search, page);

  const accounts = data?.data ?? [];
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          options={[
            { label: 'All', value: 'all' as const },
            { label: 'Unpaid', value: 'unpaid' as const },
            { label: 'Paid', value: 'paid' as const },
          ]}
          value={filter}
          onChange={(v) => { setFilter(v); setPage(1); }}
        />
        <div className="w-full sm:w-72">
          <SearchInput
            placeholder="Search username or note..."
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border bg-card" />
          ))}
        </div>
      ) : !accounts.length ? (
        <EmptyState title="No accounts" description="No accounts match your filters." />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Username</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plan</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Price</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Payment</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expires</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a: any) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/accounts/${a.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {a.marzban_username}
                      </Link>
                      {a.note && (
                        <p className="text-xs text-muted-foreground">{a.note}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.user?.first_name ?? a.user?.username ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {a.seller_plan?.name ?? a.plan?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">{a.price?.toLocaleString() ?? '—'} T</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          a.payment_status === 'paid'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : a.payment_status === 'unpaid'
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {a.payment_status ?? a.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(a.expires_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    page === i + 1
                      ? 'bg-primary text-primary-foreground'
                      : 'border hover:bg-secondary'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
