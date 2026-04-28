'use client';

import { useDashboardStats } from '@/panel/lib/hooks/use-dashboard';
import { StatsCards } from '@/panel/components/dashboard/stats-cards';

export default function DashboardPage() {
  const { data, error, isLoading } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border bg-card"
          />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        Failed to load dashboard stats.
      </div>
    );
  }

  return <StatsCards stats={data} />;
}
