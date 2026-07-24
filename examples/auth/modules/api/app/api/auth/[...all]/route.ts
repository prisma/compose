import { authProxy } from '@prisma/composer-prisma-cloud/auth';
import service from '../../../../src/service.ts';

/**
 * The module's golden path: mount `authProxy` at `/api/auth/*` on THIS app's
 * origin, forwarding to the auth service (`deps.authApi`). The browser client
 * is same-origin, so cookies are first-party and redirect flows land back here.
 * Deps are read from `service.load()` — inferred, never hand-declared.
 */
export const dynamic = 'force-dynamic';

const handler = (request: Request): Promise<Response> => authProxy(service.load().authApi)(request);

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
  handler as HEAD,
};
