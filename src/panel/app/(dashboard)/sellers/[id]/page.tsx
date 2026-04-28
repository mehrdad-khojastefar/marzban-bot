'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Power } from 'lucide-react';
import { useSeller, useSellerPlans, useSellerAccounts } from '@/panel/lib/hooks/use-sellers';
import { api } from '@/panel/lib/api';
import { FilterTabs } from '@/panel/components/shared/filter-tabs';
import { EmptyState } from '@/panel/components/shared/empty-state';
import { ConfirmDialog } from '@/panel/components/shared/confirm-dialog';
import Link from 'next/link';

export default function SellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: seller, mutate: mutateSeller } = useSeller(id);
  const { data: plans, mutate: mutatePlans } = useSellerPlans(id);
  const [tab, setTab] = useState<'info' | 'plans' | 'accounts'>('info');
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [page, setPage] = useState(1);
  const { data: accountsData, mutate: mutateAccounts } = useSellerAccounts(
    id,
    filter,
    page,
  );

  // Editable fields
  const [note, setNote] = useState<string | null>(null);
  const [linkPrefix, setLinkPrefix] = useState<string | null>(null);

  // Plan creation
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planType, setPlanType] = useState<'fixed' | 'per_unit'>('fixed');
  const [planData, setPlanData] = useState('');
  const [planPrice, setPlanPrice] = useState('');

  // Settle
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showSettle, setShowSettle] = useState(false);

  if (!seller) {
    return <div className="animate-pulse space-y-4"><div className="h-40 rounded-xl border bg-card" /></div>;
  }

  const handleSave = async (field: string, value: string | boolean) => {
    await api(`/api/sellers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ [field]: value }),
    });
    mutateSeller();
  };

  const handleCreatePlan = async () => {
    await api(`/api/sellers/${id}/plans`, {
      method: 'POST',
      body: JSON.stringify({
        name: planName,
        type: planType,
        dataLimit: Math.round(parseFloat(planData) * 1073741824),
        price: parseInt(planPrice),
      }),
    });
    setShowPlanForm(false);
    setPlanName('');
    setPlanData('');
    setPlanPrice('');
    mutatePlans();
  };

  const handleTogglePlan = async (planId: number, isActive: boolean) => {
    await api(`/api/sellers/${id}/plans/${planId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !isActive }),
    });
    mutatePlans();
  };

  const handleSettle = async () => {
    await api(`/api/sellers/${id}/accounts/settle`, {
      method: 'POST',
      body: JSON.stringify(
        selectedIds.length ? { accountIds: selectedIds } : { all: true },
      ),
    });
    setSelectedIds([]);
    setShowSettle(false);
    mutateAccounts();
    mutateSeller();
  };

  const accounts = accountsData?.data ?? [];
  const totalPages = accountsData ? Math.ceil(accountsData.total / accountsData.pageSize) : 1;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/sellers')}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Sellers
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            {seller.user?.first_name ?? `Seller #${seller.id}`}
          </h2>
          <p className="text-sm text-muted-foreground">
            Chat ID: {seller.chat_id} {seller.user?.username && `| @${seller.user.username}`}
          </p>
        </div>
        <button
          onClick={() => handleSave('isActive', !seller.is_active)}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
            seller.is_active
              ? 'border text-destructive hover:bg-destructive/10'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          <Power className="h-4 w-4" />
          {seller.is_active ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['info', 'plans', 'accounts'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t} {t === 'plans' && plans ? `(${plans.length})` : ''}
            {t === 'accounts' ? ` (${seller._count?.accounts ?? 0})` : ''}
          </button>
        ))}
      </div>

      {/* Info Tab */}
      {tab === 'info' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-4 rounded-xl border bg-card p-6">
            <h3 className="font-medium">Details</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Note</label>
                <div className="mt-1 flex gap-2">
                  <input
                    className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={note ?? seller.note ?? ''}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <button
                    onClick={() => note !== null && handleSave('note', note)}
                    className="rounded-lg border p-2 hover:bg-secondary"
                  >
                    <Save className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Link Prefix</label>
                <div className="mt-1 flex gap-2">
                  <input
                    className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Default prefix"
                    value={linkPrefix ?? seller.link_prefix ?? ''}
                    onChange={(e) => setLinkPrefix(e.target.value)}
                  />
                  <button
                    onClick={() => linkPrefix !== null && handleSave('linkPrefix', linkPrefix)}
                    className="rounded-lg border p-2 hover:bg-secondary"
                  >
                    <Save className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4 rounded-xl border bg-card p-6">
            <h3 className="font-medium">Financial Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Total Accounts</p>
                <p className="text-lg font-semibold">{seller._count?.accounts ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-lg font-semibold">{seller.activeAccounts ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Debt</p>
                <p className="text-lg font-semibold text-destructive">
                  {(seller.totalDebt ?? 0).toLocaleString()} T
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-lg font-semibold">
                  {seller.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plans Tab */}
      {tab === 'plans' && (
        <div className="space-y-4">
          <button
            onClick={() => setShowPlanForm(!showPlanForm)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + Add Plan
          </button>

          {showPlanForm && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Plan name"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <select
                  value={planType}
                  onChange={(e) => setPlanType(e.target.value as 'fixed' | 'per_unit')}
                  className="rounded-lg border bg-background px-3 py-2 text-sm outline-none"
                >
                  <option value="fixed">Fixed</option>
                  <option value="per_unit">Per Unit</option>
                </select>
                <input
                  placeholder="Data limit (GB)"
                  value={planData}
                  onChange={(e) => setPlanData(e.target.value)}
                  className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  placeholder="Price (Toman)"
                  value={planPrice}
                  onChange={(e) => setPlanPrice(e.target.value)}
                  className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreatePlan}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowPlanForm(false)}
                  className="rounded-lg border px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!plans?.length ? (
            <EmptyState title="No plans" description="Create a plan for this seller." />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Price</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p: any) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 capitalize">{p.type}</td>
                      <td className="px-4 py-3">
                        {(Number(p.data_limit) / 1073741824).toFixed(1)} GB
                      </td>
                      <td className="px-4 py-3">{p.price.toLocaleString()} T</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleTogglePlan(p.id, p.is_active)}
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            p.is_active
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                        >
                          {p.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Accounts Tab */}
      {tab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <FilterTabs
              options={[
                { label: 'All', value: 'all' as const },
                { label: 'Unpaid', value: 'unpaid' as const },
                { label: 'Paid', value: 'paid' as const },
              ]}
              value={filter}
              onChange={(v) => { setFilter(v); setPage(1); }}
            />
            <div className="flex gap-2">
              {selectedIds.length > 0 && (
                <button
                  onClick={() => setShowSettle(true)}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white"
                >
                  Settle Selected ({selectedIds.length})
                </button>
              )}
              <button
                onClick={() => { setSelectedIds([]); setShowSettle(true); }}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-secondary"
              >
                Settle All Unpaid
              </button>
            </div>
          </div>

          {!accounts.length ? (
            <EmptyState title="No accounts" />
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-secondary/50">
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            setSelectedIds(
                              e.target.checked
                                ? accounts.filter((a: any) => a.payment_status === 'unpaid').map((a: any) => a.id)
                                : [],
                            );
                          }}
                        />
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Username</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plan</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Price</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Payment</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a: any) => (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-secondary/30">
                        <td className="px-4 py-3">
                          {a.payment_status === 'unpaid' && (
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(a.id)}
                              onChange={(e) => {
                                setSelectedIds(
                                  e.target.checked
                                    ? [...selectedIds, a.id]
                                    : selectedIds.filter((id) => id !== a.id),
                                );
                              }}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/accounts/${a.id}`}
                            className="font-medium text-accent hover:underline"
                          >
                            {a.marzban_username}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{a.seller_plan?.name ?? '—'}</td>
                        <td className="px-4 py-3">{a.price?.toLocaleString() ?? '—'} T</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              a.payment_status === 'paid'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            }`}
                          >
                            {a.payment_status ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{a.note ?? '—'}</td>
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

          <ConfirmDialog
            open={showSettle}
            title="Settle Accounts"
            description={
              selectedIds.length
                ? `Settle ${selectedIds.length} selected account(s) as paid?`
                : 'Settle all unpaid accounts for this seller?'
            }
            confirmLabel="Settle"
            onConfirm={handleSettle}
            onCancel={() => setShowSettle(false)}
          />
        </div>
      )}
    </div>
  );
}
