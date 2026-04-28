'use client';

import { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
} from 'lucide-react';
import { useFinance } from '@/panel/lib/hooks/use-finance';
import { EmptyState } from '@/panel/components/shared/empty-state';
import type { SellerFinance } from '@/panel/types';

type SortField = 'unpaidDebt' | 'paidAmount' | 'totalAccounts';

export default function FinancePage() {
  const { data, error, isLoading } = useFinance();
  const [sortField, setSortField] = useState<SortField>('unpaidDebt');
  const [sortAsc, setSortAsc] = useState(false);

  const sortedSellers = useMemo(() => {
    if (!data?.sellerBreakdown) return [];
    return [...data.sellerBreakdown].sort((a, b) => {
      const diff = a[sortField] - b[sortField];
      return sortAsc ? diff : -diff;
    });
  }, [data?.sellerBreakdown, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border bg-card"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl border bg-card" />
        <div className="h-48 animate-pulse rounded-xl border bg-card" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        Failed to load financial data.
      </div>
    );
  }

  const netIncome = data.totalRevenue - data.totalDebt;
  const maxRevenue = Math.max(...data.monthlyRevenue.map((m) => m.revenue), 1);

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </p>
            <TrendingUp className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <p className="mt-2 text-2xl font-bold">
            {data.totalRevenue.toLocaleString()} T
          </p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              Total Debt
            </p>
            <TrendingDown className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <p className="mt-2 text-2xl font-bold text-destructive">
            {data.totalDebt.toLocaleString()} T
          </p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              Net Income
            </p>
            <DollarSign className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <p
            className={`mt-2 text-2xl font-bold ${netIncome >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
          >
            {netIncome.toLocaleString()} T
          </p>
        </div>
      </div>

      {/* Monthly Revenue Chart */}
      {data.monthlyRevenue.length > 0 && (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="mb-4 font-medium">Monthly Revenue</h3>
          <div className="flex items-end gap-3" style={{ height: '200px' }}>
            {data.monthlyRevenue.map((m) => {
              const height = Math.max((m.revenue / maxRevenue) * 100, 2);
              return (
                <div
                  key={m.month}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {m.revenue.toLocaleString()} T
                  </span>
                  <div
                    className="w-full rounded-t-md bg-accent/80 transition-all"
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {m.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Seller Breakdown */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h3 className="font-medium">Seller Breakdown</h3>
        </div>
        {!sortedSellers.length ? (
          <EmptyState title="No sellers" description="No seller data available." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Seller
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground"
                    onClick={() => handleSort('totalAccounts')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Accounts
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Active
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground"
                    onClick={() => handleSort('paidAmount')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Paid
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground"
                    onClick={() => handleSort('unpaidDebt')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Unpaid Debt
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSellers.map((s: SellerFinance) => (
                  <tr
                    key={s.sellerId}
                    className="border-b last:border-0 hover:bg-secondary/30"
                  >
                    <td className="px-4 py-3 font-medium">{s.sellerName}</td>
                    <td className="px-4 py-3">{s.totalAccounts}</td>
                    <td className="px-4 py-3">{s.activeAccounts}</td>
                    <td className="px-4 py-3">
                      {s.paidAmount.toLocaleString()} T
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          s.unpaidDebt > 0 ? 'font-medium text-destructive' : ''
                        }
                      >
                        {s.unpaidDebt.toLocaleString()} T
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bank Card Revenue */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h3 className="font-medium">Bank Card Revenue</h3>
        </div>
        {!data.cardBreakdown.length ? (
          <EmptyState title="No cards" description="No bank card data available." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Card
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Holder
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Transactions
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Total Received
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.cardBreakdown.map((c) => (
                  <tr
                    key={c.cardId}
                    className="border-b last:border-0 hover:bg-secondary/30"
                  >
                    <td className="px-4 py-3 font-mono">**** {c.lastFour}</td>
                    <td className="px-4 py-3">{c.holderName}</td>
                    <td className="px-4 py-3">{c.transactionCount}</td>
                    <td className="px-4 py-3 font-medium">
                      {c.totalReceived.toLocaleString()} T
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h3 className="font-medium">Recent Transactions</h3>
        </div>
        {!data.recentTransactions.length ? (
          <EmptyState
            title="No transactions"
            description="No recent transactions."
          />
        ) : (
          <div className="overflow-x-auto">
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
                {data.recentTransactions.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b last:border-0 hover:bg-secondary/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {t.transactionId}
                    </td>
                    <td className="px-4 py-3">{t.userName}</td>
                    <td className="px-4 py-3">
                      {t.amount.toLocaleString()} T
                    </td>
                    <td className="px-4 py-3 capitalize">{t.method}</td>
                    <td className="px-4 py-3">
                      <TransactionBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString('fa-IR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionBadge({ status }: { status: string }) {
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
