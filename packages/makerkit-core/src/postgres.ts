import type { PostgresDescriptor } from "./descriptors.ts";

/**
 * Declares a Postgres dependency. Named as a Service Input, it hydrates to a
 * `Bun.SQL` client at runtime; at deploy time the same descriptor is the
 * provisioning intent (lowered onto `prisma-alchemy` — a later slice). No
 * data contract yet.
 */
export function postgres(): PostgresDescriptor {
  return { kind: "postgres" };
}
