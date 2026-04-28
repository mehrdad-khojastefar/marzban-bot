'use client';

import { useState } from 'react';
import { useUsers } from '@/panel/lib/hooks/use-users';
import { SearchInput } from '@/panel/components/shared/search-input';
import { EmptyState } from '@/panel/components/shared/empty-state';

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useUsers(search, page);

  const users = data?.data ?? [];
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <div className="w-full sm:w-72">
          <SearchInput
            placeholder="Search name, username, or chat ID..."
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg border bg-card"
            />
          ))}
        </div>
      ) : !users.length ? (
        <EmptyState
          title="No users"
          description="No users match your search."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Username
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Chat ID
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Accounts
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Transactions
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Test
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b last:border-0 hover:bg-secondary/30"
                  >
                    <td className="px-4 py-3 font-medium">
                      {u.firstName}
                      {u.lastName ? ` ${u.lastName}` : ''}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.username ? `@${u.username}` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {u.chatId}
                    </td>
                    <td className="px-4 py-3">{u.accountCount}</td>
                    <td className="px-4 py-3">{u.transactionCount}</td>
                    <td className="px-4 py-3">
                      {u.hasTest ? (
                        <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString('fa-IR')}
                    </td>
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
    </div>
  );
}
