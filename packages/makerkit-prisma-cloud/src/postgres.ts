import type { ResourceEnd, ResourceNode } from '@makerkit/core';
import { resource, resourceEnd } from '@makerkit/core';

export interface PostgresConfig {
  readonly url: string;
}

/**
 * A Postgres resource identity — the ONE place the database exists. A hex
 * provisions it (`h.provision('db', postgres({ name: 'db' }))`) and wires the
 * ref into each consumer's postgresDep slot; it is never created because a
 * service mentioned it. Return type declared explicitly so the 'postgres'
 * literal never widens (an inline call nested in provision() otherwise
 * infers ResourceNode<string>).
 */
export const postgres = (opts: { name: string }): ResourceNode<'postgres'> =>
  resource({
    name: opts.name,
    pack: '@makerkit/prisma-cloud',
    type: 'postgres',
  });

/**
 * A service's Postgres dependency declaration — the ResourceEnd slot the hex
 * wires a provisioned postgres() into. The app supplies the client factory;
 * C is inferred from its return type. `name` is diagnostic only and falls
 * back to "postgres".
 */
export const postgresDep = <C>(opts: {
  client: (config: PostgresConfig) => C | Promise<C>;
  name?: string;
}): ResourceEnd<C, 'postgres'> =>
  resourceEnd({
    ...(opts.name !== undefined ? { name: opts.name } : {}),
    type: 'postgres',
    connection: {
      params: { url: { type: 'string', secret: true } },
      // v: { url: string } — enforced by the declaration.
      hydrate: (v) => opts.client({ url: v.url }),
    },
  });
