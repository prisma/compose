# Slice R3 — core-owned config pipeline

## At a glance

```ts
// src/connections.ts — app file; driver import lives here; client type INFERRED
export const db = postgres({ client: ({ url }) => new SQL({ url }) })

// src/service.ts
export default compute({ db }, ({ db }, { port }) => Bun.serve(...))

// src/main.ts — the whole entry
runHost(service)

// a test — field-level override through core, no env faked
runHost(service, { config: { "db.url": testUrl } })
```

`runtime()` / `TargetRuntime` / the hydrator registry are gone. Config is
enumerable (`configOf(service)` → manifest with keys/secret-ness/defaults),
validated before anything hydrates, and interceptable at one choke point.

## Chosen design

[`docs/design/10-domains/core-model.md`](../../../../../docs/design/10-domains/core-model.md)
as amended by commit `7862835` — §§ Core model types (Connection, HostConvention,
ContextField), Node factories, Runtime (configOf, runHost signature, ConfigError,
Motivation), the reworked pack instance, the app walkthrough, invariants 4–5. The
doc is the contract; deviations amend it with the operator first.

Responsibilities: **Service type** declares where config arrives (addressing
data, no env reads); **Connection** declares fields + hydrates a client from
resolved values (app-supplied factory, `C` inferred); **core** enumerates,
resolves, validates, intercepts, distributes, calls.

## Coherence rationale

One PR: core's runtime module rewritten (~the size it already is), the pack's
authoring constructors gain their connection/host data, the pack's `/runtime`
entry is deleted, and the two examples' `main.ts`/connection files shrink. A
reviewer holds "does the runtime path match the amended doc" in one sitting.

## Scope

**In:**
- `@makerkit/core`: `ConfigField`/`Connection`/`HostConvention`/`ContextField`
  types; `resource()`/`service()` factory signatures per the doc; `configOf` in
  the `.` entry; `runHost(root, opts?)` with resolve → validate (`ConfigError`
  naming every missing key at once) → hydrate → context; delete
  `TargetRuntime`/`Hydrator`/`HydrateContext`/`HydrateError`-as-registry-error.
- `@makerkit/prisma-cloud`: `postgres({ client })` attaching the connection
  (`url` secret field + hydrate); `compute()` attaching the Compute
  `HostConvention` (`DATABASE_URL`, `PORT` default 3000); **delete the `/runtime`
  entry**.
- Examples (`makerkit-hello`, `storefront-auth` hexes): `connections.ts` app
  files; `main.ts` → `runHost(service)`; auth keeps its resilience settings in
  its client factory.
- Tests: config manifest enumeration; resolution precedence (override > env >
  default); ConfigError lists all missing keys; field-level override boot; the
  five invariant guards updated (pack now has zero env reads; entry count).
- Deploy proof after review: both examples deploy and serve as before
  (hello ephemeral: deploy → verify → destroy; storefront-auth: redeploy over the
  live system → round trip → leave live).

**Out:** Connection as a first-class inter-service primitive (next project — this
slice only shapes the dependency-side connection); non-env channels; per-input
env naming (single default DB today); `lower()`/deploy-side changes beyond what
compiles.

## Pre-investigated edge cases

- The deploy script now *loads* the driver via the service module import
  (connections close over the factory) — accepted consequence, noted in the doc;
  works under Bun. Don't "fix" it.
- `HostConvention.key` must handle context fields distinctly from input fields
  (context resolves from `ContextField.key`, not `key()`).
- The import-split guard tests change shape: the pack `.` entry now carries small
  functions (hydrate wrappers, key rule) — still no heavy tokens; keep the
  positive-marker assertions.
- Storefront (dep-less): no connections → pipeline resolves only context fields;
  `runHost(service)` with no options must work with zero config declared.
- The redeploy of storefront-auth changes artifact hashes only (same resource
  identities — same stack names); expect update-in-place, not create.

## Slice-DoD

Plan.md R3 **Outcome** met; all gates green (both packages typecheck/test,
examples typecheck + build, invariant guards updated and passing); both deploy
proofs; PR open (stacked on R2), CI green, review loop complete.

## Open questions

None — the model was settled in design discussion (see the doc's Motivation
block); anything the build forces goes through doc-amendment-first.

## References

- `docs/design/10-domains/core-model.md` (contract, commit `7862835`) ·
  `core-and-targets.md` § Runtime · `authoring-surface.md`
- Prior slices: R1/R2 in `plan.md`; review history in
  `.drive/projects/authoring-layer/reviews/` (local).
