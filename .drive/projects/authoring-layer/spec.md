# Summary

Build and prove MakerKit's **authoring layer** — the primitives a developer writes
(`defineService`, `hex`, `provision`, connection types, the host shim) that sit
above the Alchemy/Effect compile target and lower onto our existing
`packages/prisma-alchemy` providers. Validated end-to-end against a live example on
Prisma Compute / Postgres.

# Description

## Purpose

A MakerKit developer should describe a service and its dependencies in TypeScript
and deploy to Prisma Cloud with those dependencies **injected as typed handles** —
the topology inferred from the code and validated before it runs, never hand-wired
and never read from the environment. This project turns the recorded design
([`docs/design/03-domain-model/authoring-surface.md`](../../../docs/design/03-domain-model/authoring-surface.md))
into a working primitive, proven against a real deployment rather than on paper.

## At a glance

Today `examples/storefront-auth` is hand-wired Alchemy: `alchemy.run.ts` provisions
projects/services/deployments by hand, and each service reads `process.env` for its
database and upstreams. This project replaces that with a `@makerkit/core` package
(`defineService`/`hex`/`provision`/connection-types/host-shim) that **Loads** a graph
from the code, **lowers** it onto the existing `prisma-alchemy` providers, and
**hydrates** typed dependencies into the handler at runtime. Delivered as thin,
capability-shaped vertical slices, each proven on Prisma Compute/Postgres.

# Requirements

## Cross-cutting requirements (true at the system level)

- **Proven on real Prisma Cloud.** Every slice deploys, is hit, and is observed on
  real Compute/Postgres — not only unit tests.
- **Lowers onto existing providers.** No bespoke orchestrator; the Load → emit step
  targets `packages/prisma-alchemy` (Project/Database/Connection/ComputeService/
  Deployment/EnvironmentVariable) and Alchemy's engine.
- **No globals.** User code never reads `process.env`; dependencies arrive injected.
  Environment variables may carry config into the VM but terminate at the host shim.
- **Load before Hydrate.** The graph is built and validated before anything executes.
- **Design fidelity.** Conforms to `authoring-surface.md` and the architectural
  principles (no-globals, wiring-precedes-execution, code-over-configuration).
- **The example is the proof.** `examples/storefront-auth` (or its evolving form) is
  re-expressed on the primitive and remains deployable throughout.

## Non-goals

- A bespoke provisioning orchestrator — we use Alchemy's engine + `prisma-alchemy`.
- Replacing or changing Prisma Compute / Postgres.
- General framework completeness or production DX polish.
- Runtime name-resolution / hex-to-hex addressing — start on URL baking; runtime
  resolution is a later, platform-dependent question.
- Non-Postgres BYO resources (object storage, cache, queues) early.
- Data-migration semantics up front — surfaced when the data-contract slice lands.

## Transitional-shape constraints

During the build, `examples/storefront-auth` may run partly on hand-wired Alchemy
and partly on `@makerkit/core`; both paths must deploy. The existing
`alchemy.run.ts` path stays working until the primitive fully replaces it.

# Acceptance Criteria (project DoD)

- [ ] The single-service, then paired-service, example deploys via `@makerkit/core`
      primitives (not hand-written `alchemy.run.ts`) and runs on Prisma Cloud.
- [ ] User handler code contains zero `process.env`; dependencies are injected.
- [ ] Each shipped slice's capability is demonstrated on Compute and its slice-DoD met.
- [ ] End state: the `storefront-auth` topology is authored entirely in `@makerkit/core`
      and lowers to the same running system it does today.

# References

- [`docs/design/03-domain-model/authoring-surface.md`](../../../docs/design/03-domain-model/authoring-surface.md) — the settled design this realizes
- [`docs/design/03-domain-model/glossary.md`](../../../docs/design/03-domain-model/glossary.md) — authoring terms + compile target
- [`docs/design/03-domain-model/layering.md`](../../../docs/design/03-domain-model/layering.md) — how the authoring plane lowers
- [`docs/design/01-principles/architectural-principles.md`](../../../docs/design/01-principles/architectural-principles.md)
- `packages/prisma-alchemy` — the compile target (providers)
- `examples/storefront-auth` — the proving ground

# Open Questions

- **Hex-to-hex addressing** — URL baking (today) vs runtime name resolution (needed
  for cycles / independent redeploy). Surfaces first in slice 2.
- **Migrations** — when/how they run under a data contract, and who owns them (slice 5+).
- **`use()` scoping** for framework-hosted services — process- vs request-scoped.
- **Cross-repo contract provenance** for shared connection types.
- **Package shape** — where `@makerkit/core` lives and its control/execution import
  split (tree-shaking).
- **Sizing** — the full capability sequence exceeds one 1–4-slice Drive project; we
  treat this as a multi-project **initiative** tracked by one plan and re-boundary as
  we go (see `plan.md`).
