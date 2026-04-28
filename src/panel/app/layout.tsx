import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Doves Admin',
  description: 'Doves VPN subscription management panel',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
