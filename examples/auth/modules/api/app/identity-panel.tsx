'use client';

import { useState } from 'react';
import { authClient } from '../src/auth-client.ts';

interface FetchResult {
  readonly status: number;
  readonly body: unknown;
}

/** A `token` string off an unknown value, or '' — narrowed by `in` + `typeof`, no cast. */
function tokenOf(value: unknown): string {
  return typeof value === 'object' &&
    value !== null &&
    'token' in value &&
    typeof value.token === 'string'
    ? value.token
    : '';
}

/**
 * The "who am I" panel. The session line comes from the kit's client
 * (`useSession`, which reads `/api/auth/get-session` through the proxy). The two
 * buttons drive the JSON demo surfaces the deployed smoke also hits: `/me`
 * (stateless JWT verify) and `/session` (the session port). Surfacing both makes
 * the JWT-vs-instant-logout trade-off legible in the browser.
 */
export function IdentityPanel() {
  const { data: session, isPending } = authClient.useSession();
  const [me, setMe] = useState<FetchResult | null>(null);
  const [sessionLookup, setSessionLookup] = useState<FetchResult | null>(null);

  async function checkMe() {
    // The bearer session mints a short-lived JWT via the proxied /api/auth/token.
    const minted = await authClient.$fetch('/token');
    const res = await fetch('/me', {
      headers: { authorization: `Bearer ${tokenOf(minted.data)}` },
    });
    setMe({ status: res.status, body: await res.json() });
  }

  async function checkSession() {
    const res = await fetch('/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenOf(session?.session) }),
    });
    setSessionLookup({ status: res.status, body: await res.json() });
  }

  if (isPending) return <p className="text-muted-foreground text-sm">Checking session…</p>;

  if (!session) {
    return <p className="text-muted-foreground text-sm">Not signed in.</p>;
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p data-testid="identity">
        Signed in as <strong>{session.user.email}</strong>
        {session.user.emailVerified ? ' (verified)' : ' (unverified)'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={checkMe}
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5"
        >
          GET /me (JWT verify)
        </button>
        <button
          type="button"
          onClick={checkSession}
          className="bg-secondary text-secondary-foreground rounded-md px-3 py-1.5"
        >
          POST /session (session port)
        </button>
        <button
          type="button"
          onClick={() => authClient.signOut()}
          className="rounded-md border px-3 py-1.5"
        >
          Sign out
        </button>
      </div>
      {me !== null && (
        <pre className="bg-muted overflow-x-auto rounded-md p-3" data-testid="me-result">
          /me → {me.status} {JSON.stringify(me.body, null, 2)}
        </pre>
      )}
      {sessionLookup !== null && (
        <pre className="bg-muted overflow-x-auto rounded-md p-3" data-testid="session-result">
          /session → {sessionLookup.status} {JSON.stringify(sessionLookup.body, null, 2)}
        </pre>
      )}
    </div>
  );
}
