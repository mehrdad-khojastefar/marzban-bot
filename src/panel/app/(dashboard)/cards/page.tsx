'use client';

import { useState } from 'react';
import { Plus, Trash2, Power } from 'lucide-react';
import { useCards } from '@/panel/lib/hooks/use-cards';
import { api } from '@/panel/lib/api';
import { EmptyState } from '@/panel/components/shared/empty-state';
import { ConfirmDialog } from '@/panel/components/shared/confirm-dialog';

export default function CardsPage() {
  const { data: cards, isLoading, mutate } = useCards();
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Form state
  const [lastFour, setLastFour] = useState('');
  const [holderName, setHolderName] = useState('');
  const [bankName, setBankName] = useState('');

  const handleCreate = async () => {
    await api('/api/cards', {
      method: 'POST',
      body: JSON.stringify({
        lastFour,
        holderName,
        bankName: bankName || null,
      }),
    });
    setShowForm(false);
    setLastFour('');
    setHolderName('');
    setBankName('');
    mutate();
  };

  const handleToggle = async (id: number, isActive: boolean) => {
    await api(`/api/cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !isActive }),
    });
    mutate();
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    await api(`/api/cards/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border bg-card"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Bank Cards</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Card
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              placeholder="Last 4 digits"
              maxLength={4}
              value={lastFour}
              onChange={(e) =>
                setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              placeholder="Card holder name"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              placeholder="Bank name (optional)"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!lastFour || !holderName}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!cards?.length ? (
        <EmptyState
          title="No cards"
          description="Add a bank card to get started."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
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
                  Bank
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Assigned Users
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Revenue
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr
                  key={c.id}
                  className="border-b last:border-0 hover:bg-secondary/30"
                >
                  <td className="px-4 py-3 font-mono">**** {c.lastFour}</td>
                  <td className="px-4 py-3 font-medium">{c.holderName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.bankName ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(c.id, c.isActive)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      <Power className="h-3 w-3" />
                      {c.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3">{c.assignedUserCount}</td>
                  <td className="px-4 py-3">
                    {c.totalRevenue.toLocaleString()} T
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDeleteId(c.id)}
                      className="rounded-lg border p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete Card"
        description="Are you sure you want to delete this bank card? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
