# Authoring Layer — Design Notes

The **design is already settled and recorded** in the canonical docs — this file does
not restate it, it points to it and captures only build-specific shape decisions.

## Canonical design (source of truth)

- [`docs/design/03-domain-model/authoring-surface.md`](../../../docs/design/03-domain-model/authoring-surface.md)
  — one port mechanic; direction inferred from position; neutral connection types +
  dependency inversion; black-box Service vs transparent Hex; `Input→args / Output→return`
  + `provision()`; the `define` call as the manifest; host-shim entrypoint with
  frameworks as Output adapters; the **Load → Hydrate** lifecycle.
- [`glossary.md`](../../../docs/design/03-domain-model/glossary.md) — authoring terms + the Alchemy/Effect compile target.
- [`layering.md`](../../../docs/design/03-domain-model/layering.md) — authoring → provisioning → hosting.
- [`architectural-principles.md`](../../../docs/design/01-principles/architectural-principles.md) — no-globals, wiring-precedes-execution, code-over-configuration.

## Build-specific shape (decisions the design doc leaves to implementation)

- **`@makerkit/core` package.** New workspace package holding the authoring functions
  (`defineService`, `hex`, `provision`, connection-type constructors) and the runtime
  host shim. Control-plane (Load/lower) and execution-plane (shim/hydrate) behind
  **separate import surfaces** (per the tree-shaking principle) — exact split TBD in
  slice 1.
- **Lowering target.** The Load step emits onto the existing `packages/prisma-alchemy`
  providers; it does not reimplement provisioning. Slice 1 maps one service →
  Project + ComputeService + Deployment.
- **Descriptor duality.** `postgres()` / connection types are one value read twice —
  by the control plane at deploy (provision + wire config) and by the shim at runtime
  (hydrate a typed client). Env-var names by convention (services are isolated).
- **Start on URL baking.** Hex-to-hex addressing uses deploy-time URL baking (as the
  MVP does) until a slice proves it painful enough to justify runtime name resolution.

## Open questions

Tracked in `spec.md` (§ Open Questions) and surfaced per-slice in `plan.md`:
addressing, migrations, `use()` scoping, cross-repo contracts, package/import split.
