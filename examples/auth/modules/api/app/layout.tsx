import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { Providers } from './providers.tsx';
import './globals.css';

export const metadata = { title: 'Prisma Composer — Auth demo' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-muted/40 text-foreground antialiased">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
