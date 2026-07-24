import Link from 'next/link';
import service from '../../src/service.ts';

export const dynamic = 'force-dynamic';

/** The first http(s) URL in a body — the verification / magic-link the browser must follow. */
function firstLink(text: string | null, html: string): string | undefined {
  const match = (text ?? '').match(/https?:\/\/[^\s"'<>]+/) ?? html.match(/https?:\/\/[^\s"'<>]+/);
  return match?.[0];
}

/**
 * The dev inbox. A browser user has no real inbox and local delivery is `none`,
 * so the verification / magic-link email exists only in the email module's
 * outbox. This page reads the latest email for an address straight from the
 * outbox port (`service.load().outbox`) and renders its link as a clickable
 * anchor — which doubles as visible proof of the module-to-module email wiring.
 */
export default async function Inbox({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const { to } = await searchParams;
  const { outbox } = service.load();
  const emails =
    to === undefined || to === '' ? [] : (await outbox.listEmails({ to, limit: 10 })).emails;

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Dev inbox</h1>
        <p className="text-muted-foreground text-sm">
          Local delivery is <code>none</code>. Enter the address you signed up with to read its
          verification / magic-link email out of the outbox and follow the link.
        </p>
      </header>

      <form className="flex gap-2" action="/inbox" method="get">
        <input
          type="email"
          name="to"
          defaultValue={to ?? ''}
          placeholder="you@example.com"
          aria-label="Email address"
          className="flex-1 rounded-md border px-3 py-2"
        />
        <button type="submit" className="bg-primary text-primary-foreground rounded-md px-4 py-2">
          Load
        </button>
      </form>

      <ul className="flex flex-col gap-4">
        {emails.map((email) => {
          const link = firstLink(email.text, email.html);
          return (
            <li key={email.id} className="flex flex-col gap-2 rounded-lg border p-4">
              <div className="flex items-baseline justify-between gap-4">
                <strong>{email.subject}</strong>
                <span className="text-muted-foreground text-xs">{email.createdAt}</span>
              </div>
              <span className="text-muted-foreground text-xs">
                {email.templateId} → {email.to.join(', ')}
              </span>
              {link !== undefined ? (
                <a href={link} className="text-primary break-all underline underline-offset-4">
                  {link}
                </a>
              ) : (
                <span className="text-muted-foreground text-sm">(no link in this email)</span>
              )}
            </li>
          );
        })}
        {to !== undefined && to !== '' && emails.length === 0 && (
          <li className="text-muted-foreground text-sm">No email yet for {to}.</li>
        )}
      </ul>

      <Link href="/" className="text-muted-foreground text-sm underline-offset-4 hover:underline">
        Back to the demo home
      </Link>
    </main>
  );
}
