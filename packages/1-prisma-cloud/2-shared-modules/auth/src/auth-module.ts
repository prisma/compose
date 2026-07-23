/**
 * The `auth()` module (spec § Module factory — the `email` boundary dep
 * arrives with the email-flows slice): a dedicated service wrapping Better
 * Auth. The database is a BOUNDARY dependency — the root decides dedicated
 * vs shared; the instance secret is the service's ordinary secret slot,
 * bound to `mintedSecret()` here so it is platform-minted and invisible to
 * consumers. `baseUrl` is the PUBLIC origin of the consumer app
 * (scheme+host, no trailing slash, no path); roots bind it
 * `envParam('AUTH_BASE_URL')`.
 */
import type { ModuleNode, ParamNeed } from '@internal/core';
import { module, paramNeed } from '@internal/core';
import { mintedSecret } from '@internal/prisma-cloud';
import { authService } from './auth-service.ts';
import { authAdminContract, authApiContract, authDb, authSessionContract } from './contract.ts';

export function auth(opts?: { name?: string }): ModuleNode<
  { db: ReturnType<typeof authDb> },
  {
    api: typeof authApiContract;
    session: typeof authSessionContract;
    admin: typeof authAdminContract;
  },
  Record<never, never>,
  { baseUrl: ParamNeed }
> {
  return module(
    opts?.name ?? 'auth',
    {
      deps: { db: authDb() },
      params: { baseUrl: paramNeed() },
      expose: {
        api: authApiContract,
        session: authSessionContract,
        admin: authAdminContract,
      },
    },
    ({ inputs, params, provision }) => {
      const service = provision(authService(), {
        id: 'service',
        deps: { db: inputs.db },
        secrets: { secret: mintedSecret() },
        params: { baseUrl: params.baseUrl },
      });
      return { api: service.api, session: service.session, admin: service.admin };
    },
  );
}
