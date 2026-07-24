/**
 * The api service: the browser front door. A Next.js app (output: standalone)
 * run as a Composer compute service. Wires the auth module's public port three
 * ways — `authApi()` (the `/api/auth/*` proxy's upstream), `jwtVerifier()`
 * (stateless `/me` verification over the same instance's JWKS) — plus the
 * `session` rpc port for the explicit instant-logout lookup, and the email
 * module's read-only `outbox` port that backs the dev inbox page (local
 * delivery is `none`, so a browser user reads the verification / magic-link
 * URL out of the outbox). The route handlers and pages read these via
 * `service.load()`; no hand-declared dep interface.
 */
import nextjs from '@prisma/composer/nextjs';
import { rpc } from '@prisma/composer/service-rpc';
import { compute } from '@prisma/composer-prisma-cloud';
import { authApi, authSessionContract, jwtVerifier } from '@prisma/composer-prisma-cloud/auth';
import { emailOutboxContract } from '@prisma/composer-prisma-cloud/email';

export default compute({
  name: 'api',
  deps: {
    authApi: authApi(),
    verifier: jwtVerifier(),
    session: rpc(authSessionContract),
    outbox: rpc(emailOutboxContract),
  },
  // `appDir` is the Next app root; `next build` (output: standalone) is all the
  // app does — deploy assembly copies the standalone tree and the static/public
  // assets Next omits, and locates server.js itself.
  build: nextjs({ module: import.meta.url, appDir: '..' }),
});
