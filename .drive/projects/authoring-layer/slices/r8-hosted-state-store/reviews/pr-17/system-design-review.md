# System-design review — PR #17, R8 Prisma-hosted Alchemy state store

Lens: architect (DDD ubiquitous language, Clean Architecture dependency
direction, SOLID). Scope: `claude/makerkit-authoring-onboarding-9404cc` vs
`origin/main` (merge-base a370334), ~2100 insertions across 27 files. This is
the formal architect pass; the earlier in-branch Opus review (plan.md D5, verdict
ship) is not rerun here. Implementation correctness, failure modes, and
operability belong to the principal-engineer pass — referred, not adjudicated.

**Verdict: ship.** The structure is coherent. The store lands in the right
package, core stays target-neutral in *meaning* (not just in what compiles), and
the new names conform to Alchemy's own state-store vocabulary rather than
inventing a parallel one. Every finding below is minor, a referral, or
pre-existing conceptual debt this slice touches but did not create. Nothing here
blocks merge.

---

## What concept is added, at the type/module level

- **`@makerkit/prisma-alchemy/state`** — a new deploy-machine-only subpath
  export. It is a concrete implementation of Alchemy's 12-method `StateService`
  over `postgres.js`, plus the automatic bootstrap (find-or-create the
  `makerkit-state` project → default DB → fresh connection) and a session
  advisory lock. Public surface: `prismaState()`, `makePrismaStateService()`,
  `migratePrismaState()`.
- **`Target.state?: () => AlchemyStateLayer`** — a new optional seam on the
  target SPI in `@makerkit/core/deploy`, plus `resolveStateLayer(opts, target)`
  (the pure precedence selector) and the `AlchemyStateLayer` type alias.
- **Hosted-by-default** — `prismaCloud()` supplies
  `state: () => prismaState({ workspaceId })`; explicit `opts.state` still wins.

The load-bearing typology decision: the store is modelled as *one more Alchemy
state Layer*, indistinguishable at the seam from `localState()`. Core learns a
generic "a target may carry a default state layer" fact and nothing about Prisma.
That is the correct altitude for the distinction, and it is held cleanly.

---

## Naming & typology — probe results

The strongest positive finding of this review: **the new names instantiate
Alchemy's own factory convention instead of coining synonyms.**

| Alchemy (substrate) | This slice | Verdict |
| --- | --- | --- |
| `localState()` → `Layer` | `prismaState()` → `Layer` | symmetric |
| `makeLocalState()` → raw service | `makePrismaStateService()` → raw `StateService` | symmetric |
| store `id: "local"` / `"inmemory"` (names the medium) | `id: "prisma-postgres"` (names the medium) | consistent |

The `prismaState` / `makePrismaStateService` pair mirrors Alchemy's
`localState` / `makeLocalState` pair exactly — the Layer form for the seam, the
raw factory for testing and composition. A fresh contributor who knows Alchemy
reads these correctly on first contact. This is conceptual integrity done right.

Probes fired on every introduced name:

- **`guardStateService(service, checkLive)`** — decorator that re-checks the lock
  lease before each storage call. The `guard*` verb names a mechanism, not a
  domain concept, but that is appropriate for infrastructure, and the
  raw-vs-guarded pair (`makePrismaStateService` ↔ `guardStateService(raw, …)`) is
  a *real* structural distinction, not a smuggled one. `getVersion` is left
  unguarded; the asymmetry is explicitly reasoned (compile-time constant) — an
  intentional, documented asymmetry, which is the correct way to carry one.
- **`bootstrapStateConnection`**, **`acquireStateLock` → `StateLock`**,
  **`StateLockContentionError`**, **`migratePrismaState`** — all verb-noun or
  noun names whose cold reading matches their return/essence. No qualifier
  prefixes doing hidden typology work. Clean.
- **`AlchemyStateLayer`** (minor). Discriminator-completeness probe: the
  `Alchemy*` qualifier distinguishes this from *nothing* — there is only one
  state-layer concept in the system. Normally that flags a non-load-bearing
  prefix. Here it survives, narrowly: the alias literally *is*
  `Layer.Layer<State, never, StackServices>` from Alchemy, so the prefix names
  provenance (what the type *is*), not a consumer or an authoring layer. Reads
  cold as "Alchemy's state Layer type," which is true. `StateLayer` would also be
  fine; keep or rename at your discretion — non-blocking.
- **Factory-verb drift** (minor). The local pattern catalogue pins the
  "Interface + factory function" shape as `createXxx()`. This ships
  `makePrismaStateService`, not `createPrismaStateService`. The tension is real,
  but the choice is defensible and I would keep it: matching Alchemy's
  `makeLocalState` (substrate consistency) is worth more here than matching the
  repo catalogue's verb, because a reader lands on this code *from* the Alchemy
  state store, not from another MakerKit service factory. Name the trade-off so
  it is intentional; don't reconcile it.
- **`makerkit-state` (project) vs `alchemy_resource_state` / `alchemy_stack_output`
  (tables)** (minor). Mixed vocabulary — MakerKit owns the *project*, Alchemy
  owns the *table schema*. This is honest (MakerKit hosts; Alchemy defines the
  state shape) and the `alchemy_` table prefix correctly namespaces the rows
  inside a possibly-shared default database. Acceptable.

---

## Subsystem fit & dependency direction

**Boundary placement is correct.** A state *store* belongs in
`@makerkit/prisma-alchemy` — the Prisma×Alchemy provider package that already
holds the Management API client and credential plumbing the bootstrap reuses —
not in core (target-agnostic) and not in the pack (which is a lowering table,
not an infrastructure implementation). D1's reasoning holds up. It does not
warrant its own package: it is one cohesive integration with a single consumer.

**Core stays target-neutral in meaning, not just in compilation.** `core/deploy`
now imports `localState` from `alchemy/State/LocalState` as a *value* and the
`State` / `StackServices` *types* for the `AlchemyStateLayer` alias. This is
within the already-settled "Alchemy is core's provisioning substrate" decision
(core-model.md) — `localState` is Alchemy's own default store, not a deployment
target. Invariant 1 (core depends on no `prisma-*` package) is intact: the seam
traffics in the generic `AlchemyStateLayer`, and only the *pack* supplies the
Prisma-specific `prismaState`. Verified by meaning: core never names the hosted
store; it only knows "a target may hand me a state layer." Correct.

**New dependency edge: `prisma-alchemy` → `@makerkit/core`** (note; not a
blocker). This edge is created *solely* to reach two leaf utilities:
`blindCast` from `@makerkit/core/casts` (service.ts) and `assertDefined` from
`@makerkit/core/assertions` (lock test). The edge's *declared* meaning — a
provider package now depends on the domain kernel — is heavier than its actual
*cause* — it wants a lint-approved cast helper. Two things keep this from being a
defect:

1. It follows an **established repo pattern**. `makerkit-rpc` and
   `makerkit-prisma-cloud` already import `@makerkit/core/casts`. This slice
   conforms; it does not diverge.
2. `/casts` and `/assertions` are genuinely dependency-free leaf exports, so
   hosting them in core does not violate core's "imports nothing" contract.

The pre-existing question worth surfacing to the team (not this slice's to
resolve): `@makerkit/core` is documented as the pristine domain kernel, yet it
also serves as the repo-wide home for `blindCast`/`assertAll` utilities, so any
package wanting those must take a dependency on the domain core. If that set of
utilities grows, a leaf `@makerkit/std`-style package *below* core would let
providers reuse the helpers without an edge to the domain model. Referral —
conceptual debt that predates R8.

**Four-plane fit.** In core-model.md's authoring/control/deploy/execution
taxonomy, `/state` is a **deploy-plane** entry: deploy-machine-only, runs during
lowering, same category as the pack's `/target` and the adapters' `/assemble`.
That classification is correct. Note: `prisma-alchemy`'s own entries
(`/postgres`, `/compute`, `/state`) are not recorded in any plane map — the
taxonomy table in core-model.md covers core's entries only. Minor documentation
gap, not an R8 defect.

**`makerkit-state` as control-plane infrastructure.** Sound placement.
layering.md's framing — ambient platform infrastructure, never a user-topology
Resource — is the right model, and D3 gives the decisive argument: the app's own
project is circular (it does not exist before the first apply and is itself
tracked in the state it would host), and PDP has no workspace-level database, so
the store must live under *some* project. A dedicated project outside user
topology is the closest expressible stand-in until the Management API implements
`StateApi` v5 and the visible project disappears. Endorsed.

---

## Ubiquitous-language finding: "control plane" is a homonym

Priority-1 concern (homonyms-for-different-things). "Control plane" carries two
different meanings across the design docs a fresh contributor reads together:

- **core-model.md** — the four-plane taxonomy names **control** as the
  build-time model-interrogation plane (`Load`, `configOf`, the topology view).
- **layering.md** — calls the hosted state store **"control-plane
  infrastructure, not a user-topology Resource,"** using "control plane" in the
  generic control-plane-vs-data-plane infrastructure sense.

These are unrelated concepts wearing the same words. A reader who has just
internalised the four planes will try to file the state store under
core-model.md's "control" plane, where it does not belong (it is deploy-plane).
The collision is **pre-existing in layering.md** — this slice did not introduce
the phrase — but R8's amendment reinforces it by describing the store there.
Referral: pick one term. If layering.md means "ambient platform infrastructure,"
say that, and reserve "control plane" for core-model.md's build-time plane (or
vice-versa). Ubiquitous-language debt; cheap to fix now, compounds later.

---

## Design-doc integrity

- **core-model.md amendment is accurate.** The added `Target.state` field, the
  reworded `LowerOptions.state` comment, and the updated `lower()` wrapper line
  (`state: opts.state ?? target.state?.() ?? localState()`) match `deploy.ts`
  and `resolveStateLayer` exactly. The doc shows the inline expression while the
  code extracts a named helper — a difference of presentation, not of behaviour.
  Timeless and correct.
- **layering.md amendment is accurate.** Step 1 marked "shipped, client-side
  interim," the store described (session advisory lock per `(stack, stage)`,
  service-token-only bootstrap, `prismaCloud()` default, final platform-side
  form). Matches the code.
- **No silent deviation from D1–D8.** postgres.js driver (D2), the two-table
  schema (D2), automatic find-or-create bootstrap (D3), session-scoped advisory
  lock (D4), selection option (b) (D5), plaintext JSONB (D6) — all present as
  designed.
- **One doc-drift (low severity, referral).** The fix round rebuilt `checkLive`
  to query a *pool* connection asking `pg_locks` about the lock backend's
  captured pid — deliberately never touching the possibly-dead reserved
  connection. That final shape is recorded in plan.md's D5 block and in lock.ts's
  comment, but design-note.md D4 was not back-propagated (its text still frames
  the lock work around the reserved connection). The note's own rule is
  "deviations amend the design note." D4 does not *contradict* the code (it
  describes acquire, which is on the reserved connection; it never described
  `checkLive`'s mechanism), so this is incompleteness, not a lie. Worth a
  one-line amendment for the next reader.

---

## Test strategy at the architectural level

The test partitioning mirrors the system's conceptual partitioning cleanly:

| Concept | Test |
| --- | --- |
| store round-trip (12 methods, marker fidelity) | `state/__tests__/state.test.ts` |
| lease guard (guarded vs unguarded methods) | `state/__tests__/service.test.ts` |
| lock lifecycle (acquire / contend / release / crash-release) | `state/__tests__/lock.test.ts` |
| bootstrap (find-or-create, default DB, mint) with stubbed client | `state/__tests__/bootstrap.test.ts` |
| layer assembly (inert construction, type) | `state/__tests__/layer.test.ts` |
| core precedence (`opts > target > localState`) | `makerkit-core/…/lowering.test.ts` |
| pack seam (real `prismaState` import, network-free) | `makerkit-prisma-cloud/…/state-seam.test.ts` |

Each conceptual boundary has its own partition, and the partitions cut where the
concepts cut — the store's SQL is proven against real Postgres, the seam's
precedence is proven as a pure selector against sentinels (no Alchemy boot), and
the pack test deliberately uses no mocks to prove Layer construction is inert.
The bootstrap-pagination test gap is already flagged and accepted (plan D5).
Architecturally sound.

---

## Referrals to other lenses

- **Principal-engineer**: `checkLive`'s FT-5219 handling, the first-deploy
  find-or-create split-brain residual, connection-resource accumulation
  (one minted per run), and the inert post-destroy `alchemy_stack_output` row —
  all operability/failure-mode concerns, out of scope here.
- **Team (conceptual debt, pre-existing)**: the "control plane" homonym; whether
  repo-wide `blindCast`/assertion utilities should live in a leaf package below
  `@makerkit/core` rather than on the domain kernel.
