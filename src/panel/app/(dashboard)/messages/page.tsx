'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Save, Search } from 'lucide-react';
import { api } from '@/panel/lib/api';

export default function MessagesPage() {
  const { data: messages, isLoading, mutate } = useSWR('/api/messages', api);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const handleSave = async (key: string) => {
    await api('/api/messages', {
      method: 'PATCH',
      body: JSON.stringify({ key, text: editText }),
    });
    setEditing(null);
    mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    );
  }

  const filtered = (messages as any[] | undefined)?.filter(
    (m) =>
      !search ||
      m.key.toLowerCase().includes(search.toLowerCase()) ||
      m.text.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search messages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border bg-background py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-3">
        {filtered?.map((m: any) => (
          <div key={m.key} className="rounded-xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <code className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
                {m.key}
              </code>
              {editing !== m.key && (
                <button
                  onClick={() => {
                    setEditing(m.key);
                    setEditText(m.text);
                  }}
                  className="text-xs text-accent hover:underline"
                >
                  Edit
                </button>
              )}
            </div>

            {editing === m.key ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSave(m.key)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {m.text}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
