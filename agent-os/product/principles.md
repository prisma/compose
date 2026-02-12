# AppKit Principles (WIP)

This file captures *only* the architectural / guiding principles we’ve explicitly agreed on so far. We’ll add more as we decide them.

## No globals in user applications

**Principle:** User application code must not depend on ambient globals for platform configuration or platform services.
It should only ever depend on **injected dependencies**.

Implications:

- **No environment variables for provisioned services**
  - User code must not read `process.env`, `Bun.env`, `Deno.env`, `import.meta.env`, etc. to find database URLs, bucket names, stream ids, ports, etc.
  - The platform (or local dev CLI) may *use* environment variables internally, but only to assemble the injected dependency objects.
- **No implicit platform APIs**
  - User code should not “discover” ingress, ports, bindings, or services by reaching into global state, runtime-specific modules, or “magic” configuration.
- **Everything important is a parameter**
  - Resources like Postgres, Storage, Streams, Scheduler, and platform config are passed to entrypoints explicitly (directly or via a typed context object).

Enforcement (directional; not implemented yet):

- Provide lint rules / static checks that flag usage of forbidden globals and service-configuration env access.
- Keep a strict separation between control-plane descriptors and runtime wiring so dependency access is always explicit.

## Code-first application topology (generated manifest)

**Principle:** The application’s topology is defined in TypeScript (descriptors) and AppKit generates the deployment metadata (e.g. `appkit.map.json`) from that code.

This is Wrangler-inspired in *workflow* (build/dev/deploy + stable manifest), but AppKit avoids a hand-authored manifest as a source of truth to prevent drift.

## Two-plane architecture: control plane vs execution plane

**Principle:** AppKit must operate in two modes:

- **Control plane**: imports descriptors, validates/normalizes, builds the topology graph, emits platform metadata/artifacts, and provides handles for provisioning/inspection.
- **Execution plane**: instantiates real implementations, satisfies the graph, performs DI, and runs entrypoints.

To prevent drift, we should keep separate import surfaces (e.g. `@prisma/appkit/control` vs `@prisma/appkit/runtime`) and avoid cross-plane coupling.

## Streaming-first data access (Convex-inspired)

**Principle:** AppKit should be designed for realtime, streaming-first applications. Data should flow through services and
eventually to client devices via **streams/subscriptions**, not primarily via request/response “pull” patterns.

Implications (directional; not implemented yet):

- **Primary data access is streaming**: model data consumption as subscriptions / stream readers, not “fetch a snapshot via HTTP”.
- **HTTP is not the data plane**: HTTP endpoints may exist (e.g. for ingress, commands, webhooks), but the default UX for
  app → client synchronization should be streaming over HTTP (SSE) and/or WebSockets (TBD).
- **Service topology should expose streams explicitly**: e.g. Durable Streams as first-class resources; services bind to
  streams and publish/consume events in a typed way.

