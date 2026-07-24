import Link from 'next/link';
import { IdentityPanel } from './identity-panel.tsx';

export const dynamic = 'force-dynamic';

/**
 * The demo home: what this example proves, links into the Better Auth UI, the
 * dev inbox (where the verification / magic-link emails land), and the live
 * identity panel.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Prisma Composer — Auth demo</h1>
        <p className="text-muted-foreground text-sm">
          A real Better Auth UI, served same-origin through the app&apos;s <code>/api/auth/*</code>{' '}
          proxy to the auth module — sign up, verify from the dev inbox, sign in, and see who you
          are. No cloud credentials.
        </p>
      </header>

      <nav className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/auth/sign-up"
          className="bg-primary text-primary-foreground rounded-md px-4 py-2"
        >
          Sign up
        </Link>
        <Link href="/auth/sign-in" className="rounded-md border px-4 py-2">
          Sign in
        </Link>
        <Link href="/auth/magic-link" className="rounded-md border px-4 py-2">
          Magic link
        </Link>
        <Link href="/inbox" className="rounded-md border px-4 py-2">
          Dev inbox
        </Link>
      </nav>

      <section className="flex flex-col gap-3 rounded-lg border p-5">
        <h2 className="text-lg font-medium">Identity</h2>
        <IdentityPanel />
      </section>
    </main>
  );
}
