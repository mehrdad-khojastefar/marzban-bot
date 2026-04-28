'use client';

import {
  Users,
  Shield,
  Store,
  DollarSign,
  CreditCard,
  Activity,
} from 'lucide-react';
import type { DashboardStats } from '@/panel/types';

const cards = [
  { key: 'totalUsers', label: 'Total Users', icon: Users, format: String },
  { key: 'totalAccounts', label: 'Total Accounts', icon: Shield, format: String },
  { key: 'activeAccounts', label: 'Active Accounts', icon: Activity, format: String },
  { key: 'totalSellers', label: 'Sellers', icon: Store, format: String },
  {
    key: 'totalDebt',
    label: 'Unpaid Debt',
    icon: DollarSign,
    format: (v: number) => v.toLocaleString('en-US') + ' T',
  },
  { key: 'pendingPayments', label: 'Pending Payments', icon: CreditCard, format: String },
] as const;

export function StatsCards({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const value = stats[card.key as keyof DashboardStats];
        return (
          <div
            key={card.key}
            className="rounded-xl border bg-card p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {card.label}
              </p>
              <card.icon className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-bold">{card.format(value)}</p>
          </div>
        );
      })}
    </div>
  );
}
