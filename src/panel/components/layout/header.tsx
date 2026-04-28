'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';

const titleMap: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/sellers': 'Sellers',
  '/accounts': 'Accounts',
  '/payments': 'Payments',
  '/settings': 'Settings',
  '/messages': 'Messages',
};

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const title =
    Object.entries(titleMap).find(([path]) => pathname.startsWith(path))?.[1] ??
    'Dashboard';

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <ThemeToggle />
    </header>
  );
}
