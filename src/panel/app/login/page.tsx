'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bird } from 'lucide-react';

export default function LoginPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    // Telegram Login Widget callback
    (window as any).onTelegramAuth = async (user: Record<string, string>) => {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });

      if (res.ok) {
        router.push('/dashboard');
      } else {
        const data = await res.json();
        alert(data.error || 'Login failed');
      }
    };

    // Inject Telegram widget script
    if (containerRef.current) {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', getBotUsername());
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-radius', '8');
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.setAttribute('data-request-access', 'write');
      script.async = true;
      containerRef.current.appendChild(script);
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
            <Bird className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Doves</h1>
          <p className="text-sm text-muted-foreground">Admin Panel</p>
        </div>
        <div ref={containerRef} className="flex justify-center" />
      </div>
    </div>
  );
}

function getBotUsername(): string {
  // In production, inject via env. Fallback to empty.
  return process.env.NEXT_PUBLIC_BOT_USERNAME ?? 'doveng_bot';
}
