import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * The browser auth client. `baseURL` is THIS app's own origin — so every call
 * hits `<app>/api/auth/*` (the proxy route handler), which forwards to the auth
 * service. Same-origin means first-party httpOnly cookies and no CORS. The
 * plugin set mirrors the server's consumer-facing surface: email+password
 * (built in) plus magic-link. Admin is deliberately absent — it is not a
 * consumer-UI surface.
 */
export const authClient = createAuthClient({
  baseURL: typeof window === 'undefined' ? undefined : window.location.origin,
  plugins: [magicLinkClient()],
});
