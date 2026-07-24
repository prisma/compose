import { AuthView } from '@daveyplate/better-auth-ui';
import Link from 'next/link';

/**
 * The auth views: sign-in, sign-up, magic-link (and the kit's other flows),
 * chosen by the `[pathname]` segment. `AuthView` renders the kit's card and
 * drives it through our same-origin auth client (wired in providers.tsx).
 */
export default async function AuthPage({ params }: { params: Promise<{ pathname: string }> }) {
  const { pathname } = await params;
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <AuthView pathname={pathname} />
      <Link href="/" className="text-muted-foreground text-sm underline-offset-4 hover:underline">
        Back to the demo home
      </Link>
    </main>
  );
}
