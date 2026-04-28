'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useSellers } from '@/panel/lib/hooks/use-sellers';
import { api } from '@/panel/lib/api';
import { EmptyState } from '@/panel/components/shared/empty-state';

export default function SellersPage() {
  const { data: sellers, isLoading, mutate } = useSellers();
  const [showAdd, setShowAdd] = useState(false);
  const [chatId, setChatId] = useState('');
  const [addError, setAddError] = useState('');

  const handleAdd = async () => {
    setAddError('');
    try {
      await api('/api/sellers', {
        method: 'POST',
        body: JSON.stringify({ chatId }),
      });
      setChatId('');
      setShowAdd(false);
      mutate();
    } catch (err: any) {
      setAddError(err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sellers?.length ?? 0} sellers
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Seller
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-3 text-sm font-medium">Add new seller by Chat ID</p>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Telegram Chat ID"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setAddError('');
              }}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
          {addError && (
            <p className="mt-2 text-sm text-destructive">{addError}</p>
          )}
        </div>
      )}

      {!sellers?.length ? (
        <EmptyState title="No sellers" description="Add your first seller to get started." />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Chat ID</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Accounts</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Debt</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/sellers/${s.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {s.userName ?? s.userUsername ?? `Seller #${s.id}`}
                    </Link>
                    {s.userUsername && (
                      <span className="ml-2 text-muted-foreground">
                        @{s.userUsername}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {s.chatId}
                  </td>
                  <td className="px-4 py-3">{s.accountCount}</td>
                  <td className="px-4 py-3">
                    {s.totalDebt > 0 ? (
                      <span className="font-medium text-destructive">
                        {s.totalDebt.toLocaleString()} T
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
