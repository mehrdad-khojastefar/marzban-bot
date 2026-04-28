'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Power,
  Trash2,
  DollarSign,
} from 'lucide-react';
import { useAccount, useMarzbanStatus } from '@/panel/lib/hooks/use-accounts';
import { api } from '@/panel/lib/api';
import { ConfirmDialog } from '@/panel/components/shared/confirm-dialog';

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  return (bytes / 1048576).toFixed(0) + ' MB';
}

export default function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: account, mutate } = useAccount(id);
  const { data: marzban, mutate: mutateMarzban } = useMarzbanStatus(id);

  const [editNote, setEditNote] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<string | null>(null);
  const [editExpire, setEditExpire] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [showReset, setShowReset] = useState(false);

  if (!account) {
    return <div className="animate-pulse space-y-4"><div className="h-60 rounded-xl border bg-card" /></div>;
  }

  const handleSave = async (field: string, value: unknown) => {
    await api(`/api/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ [field]: value }),
    });
    mutate();
  };

  const handleToggle = async () => {
    const newStatus = marzban?.status === 'active' ? 'disabled' : 'active';
    await api(`/api/accounts/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ status: newStatus }),
    });
    mutateMarzban();
  };

  const handleReset = async () => {
    await api(`/api/accounts/${id}/reset`, { method: 'POST' });
    setShowReset(false);
    mutateMarzban();
  };

  const handleTogglePayment = async () => {
    await api(`/api/accounts/${id}/payment`, { method: 'PATCH' });
    mutate();
  };

  const handleDelete = async () => {
    await api(`/api/accounts/${id}`, { method: 'DELETE' });
    router.push('/accounts');
  };

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    disabled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    limited: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    expired: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };

  const usedPercent =
    marzban?.dataLimit > 0
      ? Math.min(100, Math.round((marzban.usedTraffic / marzban.dataLimit) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold font-mono">{account.marzban_username}</h2>
          <p className="text-sm text-muted-foreground">
            {account.user?.first_name ?? account.user?.username ?? 'Unknown user'}
            {account.seller && ` | Seller #${account.seller.id}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleToggle}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
              marzban?.status === 'active'
                ? 'border text-destructive hover:bg-destructive/10'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            <Power className="h-4 w-4" />
            {marzban?.status === 'active' ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* DB Info */}
        <div className="space-y-4 rounded-xl border bg-card p-6">
          <h3 className="font-medium">Account Info</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Type</span>
              <span className="capitalize">{account.type}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Plan</span>
              <span>{account.seller_plan?.name ?? account.plan?.name ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Payment</span>
              <button
                onClick={handleTogglePayment}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  account.payment_status === 'paid'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                }`}
              >
                <DollarSign className="h-3 w-3" />
                {account.payment_status ?? '—'}
              </button>
            </div>

            {/* Editable note */}
            <div>
              <label className="text-xs text-muted-foreground">Note</label>
              <div className="mt-1 flex gap-2">
                <input
                  className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={editNote ?? account.note ?? ''}
                  onChange={(e) => setEditNote(e.target.value)}
                />
                <button
                  onClick={() => editNote !== null && handleSave('note', editNote)}
                  className="rounded-lg border p-1.5 hover:bg-secondary"
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Editable price */}
            <div>
              <label className="text-xs text-muted-foreground">Price (Toman)</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={editPrice ?? account.price ?? ''}
                  onChange={(e) => setEditPrice(e.target.value)}
                />
                <button
                  onClick={() => editPrice !== null && handleSave('price', parseInt(editPrice))}
                  className="rounded-lg border p-1.5 hover:bg-secondary"
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Editable expiry */}
            <div>
              <label className="text-xs text-muted-foreground">Expires</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="date"
                  className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={
                    editExpire ??
                    new Date(account.expires_at).toISOString().split('T')[0]
                  }
                  onChange={(e) => setEditExpire(e.target.value)}
                />
                <button
                  onClick={() =>
                    editExpire !== null && handleSave('expire', editExpire)
                  }
                  className="rounded-lg border p-1.5 hover:bg-secondary"
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Marzban Live Data */}
        <div className="space-y-4 rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Live Status</h3>
            {marzban?.error && (
              <span className="text-xs text-destructive">Marzban unreachable</span>
            )}
          </div>

          {marzban && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    statusColors[marzban.status] ?? statusColors.expired
                  }`}
                >
                  {marzban.status}
                </span>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Data Usage</span>
                  <span>
                    {formatBytes(marzban.usedTraffic)} /{' '}
                    {marzban.dataLimit > 0
                      ? formatBytes(marzban.dataLimit)
                      : 'Unlimited'}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${usedPercent}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-xs text-muted-foreground">
                  {usedPercent}%
                </p>
              </div>

              <button
                onClick={() => setShowReset(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-secondary"
              >
                <RotateCcw className="h-4 w-4" />
                Reset Usage
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete Account"
        description="This will permanently delete the account from both Marzban and the database. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />

      <ConfirmDialog
        open={showReset}
        title="Reset Usage"
        description="Reset the data usage counter for this account to zero?"
        confirmLabel="Reset"
        onConfirm={handleReset}
        onCancel={() => setShowReset(false)}
      />
    </div>
  );
}
