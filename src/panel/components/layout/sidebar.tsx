'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bird,
  LayoutDashboard,
  Store,
  Users,
  CreditCard,
  Settings,
  MessageSquare,
  LogOut,
  TrendingUp,
  ArrowLeftRight,
} from 'lucide-react';
import { cn } from '@/panel/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sellers', label: 'Sellers', icon: Store },
  { href: '/accounts', label: 'Accounts', icon: Users },
  { href: '/payments', label: 'Payments', icon: CreditCard },
  { href: '/finance', label: 'Financial', icon: TrendingUp },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/cards', label: 'Cards', icon: CreditCard },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  const handleLogout = async () => {
    await fetch('/api/auth/telegram', { method: 'DELETE' });
    document.cookie = 'doves_token=; Max-Age=0; path=/';
    window.location.href = '/login';
  };

  return (
    <aside
      className={cn(
        'flex h-full w-64 flex-col border-r bg-card',
        className,
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <Bird className="h-7 w-7 text-accent" />
        <span className="text-lg font-semibold">Doves</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t px-3 py-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="h-4.5 w-4.5" />
          Logout
        </button>
      </div>
    </aside>
  );
}
