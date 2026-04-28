'use client';

import useSWR from 'swr';
import { api } from '@/panel/lib/api';

export default function SettingsPage() {
  const { data: settings, isLoading, mutate } = useSWR('/api/settings', api);

  const handleToggle = async (key: string, currentValue: string) => {
    const newValue = currentValue === 'true' ? 'false' : 'true';
    await api('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ key, value: newValue }),
    });
    mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    );
  }

  if (!settings?.length) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        No settings configured.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(settings as any[]).map((s) => {
        const isBool = s.value === 'true' || s.value === 'false';
        return (
          <div
            key={s.key}
            className="flex items-center justify-between rounded-xl border bg-card px-6 py-4"
          >
            <div>
              <p className="font-medium">{s.key}</p>
              {!isBool && (
                <p className="text-sm text-muted-foreground">{s.value}</p>
              )}
            </div>
            {isBool ? (
              <button
                onClick={() => handleToggle(s.key, s.value)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  s.value === 'true' ? 'bg-accent' : 'bg-secondary'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    s.value === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            ) : (
              <span className="rounded-lg bg-secondary px-3 py-1 text-sm font-mono">
                {s.value}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
