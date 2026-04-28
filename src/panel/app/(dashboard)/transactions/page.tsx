'use client';

import { useState } from 'react';
import { useTransactions } from '@/panel/lib/hooks/use-transactions';
import { FilterTabs } from '@/panel/components/shared/filter-tabs';
import { EmptyState } from '@/panel/components/shared/empty-state';

const statusOptions = [
  { label: 'All', value: 'all' as const },
  { label: 'Pending', value: 'pending' as const },
  { label: 'Completed', value: 'completed' as const },
  { label: 'Failed', value: 'failed' as const },
];

const methodOptions = [
  { label: 'All', value: 'all' as const },
  { label: 'Manual', value: 'manual' as const },
  { label: 'Premzy', value: 'premzy' as const },
];

export default function TransactionsPage() {
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useTransactions(status, method, page);

  const transactions = data?.data ?? [];
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          options={statusOptions}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <FilterTabs
          options={methodOptions}
          value={method}
          onChange={(v) => {
            setMethod(v);
            setPage(1);
          }}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg border bg-card"
            />
          ))}
        </div>
      ) : !transactions.length ? (
        <EmptyState
          title="No transactions"
          description="No transactions match your filters."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    User
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Plan
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Method
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b last:border-0 hover:bg-secondary/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {t.transactionId}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium">{t.userName}</span>
                        {t.userUsername && (
                          <p className="text-xs text-muted-foreground">
                            @{t.userUsername}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.planName ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {t.amount.toLocaleString()} T
                    </td>
                    <td className="px-4 py-3 capitalize">{t.method}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString('fa-IR')}
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    pending:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    checkout:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    awaiting_approval:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    cancelled:
      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.cancelled}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
