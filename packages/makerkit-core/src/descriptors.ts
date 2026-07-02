/**
 * Dependency descriptors: neutral data describing an Input a Service
 * declares. Shared by the control plane (Load validates them) and the
 * execution plane (the runtime hydrates them) — this module must stay free
 * of both, so importing it never pulls in provisioning or hydration code.
 */

/** A dependency descriptor for a Postgres Input. No data contract yet (slice 1). */
export interface PostgresDescriptor {
  readonly kind: "postgres";
}

/** Every descriptor kind a Service can declare as a dependency. */
export type Descriptor = PostgresDescriptor;

/** The map of dependency names to descriptors a `defineService` call declares. */
export type Dependencies = Record<string, Descriptor>;

function isPostgresDescriptor(value: unknown): value is PostgresDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "postgres"
  );
}

/** True if `value` is a descriptor `defineService`/`Load` recognizes. */
export function isDescriptor(value: unknown): value is Descriptor {
  return isPostgresDescriptor(value);
}
