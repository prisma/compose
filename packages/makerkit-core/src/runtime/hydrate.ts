import type { Descriptor } from "../descriptors.ts";
import type { Env } from "./postgres.ts";
import { hydratePostgres } from "./postgres.ts";

/** Builds the typed client for one declared Input's descriptor. Host-shim only. */
export function hydrateDescriptor(descriptor: Descriptor, env: Env): unknown {
  switch (descriptor.kind) {
    case "postgres":
      return hydratePostgres(descriptor, env);
    default: {
      const exhaustive: never = descriptor.kind;
      throw new Error(`No runtime hydrator for descriptor kind "${exhaustive}".`);
    }
  }
}
