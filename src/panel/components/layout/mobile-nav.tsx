'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Sidebar } from './sidebar';

export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 w-64 animate-in slide-in-from-left">
        <div className="relative h-full">
          <button
            onClick={onClose}
            className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
          <Sidebar />
        </div>
      </div>
    </div>
  );
}
