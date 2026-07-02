# Authoring Layer — Plan

## Summary

The build is a sequence of **thin, capability-shaped vertical slices**. Each is
phrased as a developer capability and is **proven end-to-end on Prisma Compute /
Postgres** — deployed, hit, observed. Each slice lowers onto the existing
`packages/prisma-alchemy` providers and conforms to the design in
[`docs/design/03-domain-model/authoring-surface.md`](../../../docs/design/03-domain-model/authoring-surface.md).

**Spec:** `.drive/projects/authoring-layer/spec.md`

## Sizing note

Per Drive sizing a project is 1–4 slices; the full sequence below is larger, so this
is really a multi-project **initiative**. This plan is the single through-line
tracker Will asked for. The **near-term project** is slices 1–3 (a single/paired
service with typed dependencies, no Hex yet); slices 4+ are the forward roadmap and
will be re-boundaried into their own projects as we reach them.

## Current position

Nothing built. **Slice 1 is next** (the agreed thin start). Design is recorded;
`packages/prisma-alchemy` providers and the `examples/storefront-auth` deploy already
work and are the foundation.

## Legend

`[ ]` not started · `[~]` in progress · `[x]` done (capability demonstrated on Compute)

---

## Near-term project — a service with typed dependencies (slices 1–3)

### [ ] Slice 1 — Service + DB dependency (no contract)

**Capability:** `defineService({ db: postgres() }, ({ db }) => …)` — MakerKit
provisions Prisma Postgres + Compute and injects a typed `db` handle; the handler has
zero `process.env`.
**Proof on Compute:** the service deploys, its endpoint returns a live DB query,
redeploy + destroy are clean.
**Scope:** scaffold `@makerkit/core` (`defineService`, the `postgres()` descriptor,
**Load**, the **lower** step to `prisma-alchemy`, the **host shim** that hydrates
`DATABASE_URL` → `db`). Lean on Compute's auto-injected `DATABASE_URL`. No Hex, no
ownership model, no Output/serving model (handler owns `Bun.serve`).
**Builds on:** nothing (greenfield package).
**Hands to:** the `@makerkit/core` skeleton — descriptor shape, Load, lower, shim.

### [ ] Slice 2 — Service → service dependency (HTTP, no interface)

**Capability:** a second service; one calls the other; MakerKit wires the address.
**Proof on Compute:** the two services communicate when deployed.
**Scope:** a service-dependency descriptor; address wiring via URL baking (as the MVP
does today). No typed interface yet.
**Builds on:** Slice 1 (core + shim).
**Hands to:** service-to-service address wiring. **Forces the addressing open question.**

### [ ] Slice 3 — Typed HTTP interface, enforced

**Capability:** declare the connection's interface (a neutral connection type);
MakerKit enforces it at **Load**.
**Proof on Compute:** a mismatch fails before deploy; a match communicates deployed.
**Scope:** connection-type value, position-inferred direction (In/Out),
Load-time integrity check.
**Builds on:** Slice 2.
**Hands to:** connection types + interface validation (the basis for Hexes and DIP).

---

## Forward roadmap (subsequent projects — captured for tracking)

### [ ] Slice 4 — Hex wiring

Define a Hex owning services wired to each other; MakerKit enforces connection
validity; functions at runtime. Introduces `hex`, `provision`, ownership, forwarding
(In→args down, Out→return up).

### [ ] Slice 5 — Replace a dependency by interface (DIP swap)

Swap one provider for another satisfying the same interface, with no consumer change;
validity checked at Load; works deployed. (Adapter node for a near-miss interface.)

### [ ] Slice 6 — Data Contract for a data dependency

Declare the contract for a data dependency; MakerKit enforces it; a violating schema
fails. **Open:** when/how migrations run and who owns them — likely splits into its
own slice.

### [ ] Slice 7 — Hex composition / app root

A Hex depending on another Hex's boundary; multi-hex deploy from one root topology.

### [ ] Slice 8 — Framework-hosted service

A Next.js service getting its dependencies via a `use()` DI accessor (no env),
deployed — the storefront on injected deps. **Open:** process- vs request-scoped `use()`.

### [ ] Slice 9 — Local emulation / test

**Load** the graph and **Hydrate** with fakes substituted at Inputs; run the whole
app with no real infrastructure (the DIP test harness).

### [ ] Slice 10 — Streams

Define an async/ordered **stream** connection between services on Compute
(request/response was the bounded case; this is the unbounded one).

## Parked / cross-cutting (revisit as slices force them)

- **Hex-to-hex addressing** — URL baking → runtime name resolution (cycles,
  independent redeploy). First pressure at Slice 2.
- **Inspectable / queryable topology** — Load → emit a queryable artifact (agent-first goal).
- **Configuration & secrets / egress** — a service declaring config + an external egress.
- **BYO resources** — non-Postgres (object storage, cache, queue) via capability layers.

---

## Linear sync

- [ ] Create a Linear Project for `authoring-layer` and an issue per near-term slice
      (pending operator go-ahead — outward-facing, not auto-created).

## Close-out (required)

- [ ] Verify all acceptance criteria in `spec.md`
- [ ] Migrate long-lived docs into `docs/` (the design already lives there)
- [ ] Strip repo-wide references to `.drive/projects/authoring-layer/**`
- [ ] Delete `.drive/projects/authoring-layer/`
