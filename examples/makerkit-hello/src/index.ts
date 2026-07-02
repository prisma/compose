import { service, postgres } from "@makerkit/core";

/**
 * A single MakerKit service: it declares a Postgres dependency and receives a
 * typed `db` client, injected by the host shim. The handler reads nothing from
 * the environment — the shim hydrates `DATABASE_URL` into `db` and resolves the
 * serving `port`, handing both over. The handler owns its own server; the
 * Output/serving model will formalize the port/server wiring in a later slice.
 */
export default service({ db: postgres() }, ({ db }, { port }) =>
  Bun.serve({
    port,
    hostname: "0.0.0.0",
    fetch: async () => Response.json(await db`select 1 as ok`),
  }),
);
