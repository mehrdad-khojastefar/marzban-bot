'use client';

import { useState } from 'react';
import { Check, X, Image } from 'lucide-react';
import { usePayments } from '@/panel/lib/hooks/use-payments';
import { api } from '@/panel/lib/api';
import { EmptyState } from '@/panel/components/shared/empty-state';
import { ConfirmDialog } from '@/panel/components/shared/confirm-dialog';

export default function PaymentsPage() {
  const { data: payments, isLoading, mutate } = usePayments();
  const [actionPayment, setActionPayment] = useState<{
    id: number;
    action: 'approve' | 'reject';
  } | null>(null);

  const handleAction = async () => {
    if (!actionPayment) return;
    await api(`/api/payments/${actionPayment.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: actionPayment.action }),
    });
    setActionPayment(null);
    mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    );
  }

  if (!payments?.length) {
    return (
      <EmptyState
        title="No pending payments"
        description="All payments have been processed."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {payments.length} pending payment(s)
      </p>

      <div className="space-y-3">
        {payments.map((p: any) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-xl border bg-card p-5"
          >
            <div className="space-y-1">
              <p className="font-medium">
                {p.user?.first_name ?? p.user?.username ?? 'Unknown'}
                {p.user?.username && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    @{p.user.username}
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                Plan: {p.plan?.name ?? '—'} | Amount:{' '}
                <span className="font-medium text-foreground">
                  {p.amount.toLocaleString()} T
                </span>
              </p>
              {p.receipt_file_id && (
                <p className="inline-flex items-center gap-1 text-xs text-accent">
                  <Image className="h-3 w-3" />
                  Receipt attached
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() =>
                  setActionPayment({ id: p.id, action: 'approve' })
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <Check className="h-4 w-4" />
                Approve
              </button>
              <button
                onClick={() =>
                  setActionPayment({ id: p.id, action: 'reject' })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <X className="h-4 w-4" />
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!actionPayment}
        title={
          actionPayment?.action === 'approve'
            ? 'Approve Payment'
            : 'Reject Payment'
        }
        description={
          actionPayment?.action === 'approve'
            ? 'This will create a new account for the user.'
            : 'The payment will be marked as rejected.'
        }
        confirmLabel={actionPayment?.action === 'approve' ? 'Approve' : 'Reject'}
        destructive={actionPayment?.action === 'reject'}
        onConfirm={handleAction}
        onCancel={() => setActionPayment(null)}
      />
    </div>
  );
}
