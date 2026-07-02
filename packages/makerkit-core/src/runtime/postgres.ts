import { SQL } from "bun";
import type { PostgresDescriptor } from "../descriptors.ts";

/** The env-var name a hydrated `postgres()` Input reads its connection URL from. */
export const DATABASE_URL_ENV_VAR = "DATABASE_URL";

/** A minimal env map — whatever the host shim resolves, never `process.env` directly. */
export type Env = Readonly<Record<string, string | undefined>>;

/**
 * Builds a `Bun.SQL` client for a `postgres()` Input from `env`. The host
 * shim is the only caller — user code never reads `env` itself.
 */
export function hydratePostgres(_descriptor: PostgresDescriptor, env: Env): SQL {
  const url = env[DATABASE_URL_ENV_VAR];
  if (!url) {
    throw new Error(`${DATABASE_URL_ENV_VAR} is required to hydrate a postgres() dependency.`);
  }
  return new SQL({ url, max: 1, idleTimeout: 10 });
}
