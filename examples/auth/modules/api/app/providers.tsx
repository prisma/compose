'use client';

import { AuthUIProvider } from '@daveyplate/better-auth-ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { authClient } from '../src/auth-client.ts';

/**
 * Wires the Better Auth UI kit to Next's router and our same-origin auth
 * client. The enabled features match the auth service exactly: `credentials`
 * (email+password), `magicLink`, and `signUp` with a name field (the module
 * requires a name at sign-up). `basePath` is where the auth views live;
 * `redirectTo` is where a successful sign-in lands.
 */
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <AuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      Link={Link}
      credentials
      magicLink
      signUp={{ fields: ['name'] }}
      basePath="/auth"
      redirectTo="/"
    >
      {children}
    </AuthUIProvider>
  );
}
