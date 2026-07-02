# Slice 1 (1a + 1b) — Code Review

Commits under review: `ea5eee3` (1a), `9047410` (1b).
Scope: `packages/makerkit-core/**`, `examples/makerkit-hello/**`.
Reviewer stance: read-only on code and tests. Verified claims by running
typecheck, the test suite, and a real bundle of the `.` entry.

## Verdict

**ANOTHER ROUND NEEDED** — but only just. The design fidelity is strong and the
code is correct; the round is warranted by two things worth fixing in this PR:
one real (if minor) design-consistency gap in the user example (`process.env.PORT`
in the service module, F1) and a missing regression guard for the single most
important property of the slice — the control/execution import split (F2). Neither
is a deploy blocker; both are cheap and compound if left.

## Scoreboard

| Area | Result |
|---|---|
| Typecheck (`turbo run typecheck`, 5 pkgs) | PASS |
| Unit tests (`bun test`, makerkit-core) | 26 pass / 0 fail |
| Example artifact build (`pnpm build`) | PASS — shim → `runHost` → `hydratePostgres` → `new SQL` → user `Bun.serve` all bundled |
| `.` authoring entry excludes Alchemy/Effect/prisma-alchemy/Bun.SQL | VERIFIED by bundle (6 modules, 1.63 KB, zero leakage) — **but no test guards it** |
| Deploy artifact excludes control plane | VERIFIED (zero alchemy/effect/prisma-alchemy in `index.js`) |
| `process.env` in user-facing surface | One occurrence: `process.env.PORT` in the example service module (F1) |
| Committed build artifact | None — `dist` is gitignored, not tracked |

## Design fidelity (authoring-surface.md) — findings

Overwhelmingly faithful. Confirmed:

- **Inputs by position, passed as handler args** — `defineService(deps, handler)`;
  `HydratedDeps` maps declared Inputs to hydrated clients; Outputs are the handler
  return. Matches the doc's `Input→args / Output→return`.
- **Descriptors are neutral data** — `postgres()` returns `{ kind: "postgres" }`,
  no methods, no runtime code. Control plane exposes the factory; execution plane
  owns a `kind`-keyed hydrator (`hydrateDescriptor` → `hydratePostgres`). Exactly
  the pure-data + kind-keyed-hydrator pattern design-notes.md confirms.
- **Load builds+validates, runs nothing** — `Load` walks `dependencies`, validates
  each descriptor, returns the graph; the handler is never called. Tests prove
  zero handler invocations through Load.
- **Importing a service module runs nothing** — the handle is inert; `run` is only
  called explicitly. Proven by the `side-effect-service` fixture test.
- **Env terminates at the host shim** — `runHost` is the only reader of `env`
  (defaulting to `process.env`); user code receives injected clients only. No
  `Bun.env` / `import.meta.env` anywhere.
- **The control/execution/lower/build import split is real** — separate entry
  points (`.`, `/lower`, `/runtime`, `/build`), and I confirmed by bundling the
  `.` entry that it drags in none of Alchemy, Effect, prisma-alchemy, or Bun.SQL.

The only fidelity gap is F1 below.

---

## Findings

### F1 — `process.env.PORT` read directly in the user service module — **Medium**

`examples/makerkit-hello/src/index.ts:3`:

```ts
const port = Number(process.env.PORT ?? 3000);
```

The slice's whole thesis (spec.md:26) is inverting env reads: "MakerKit reads the
env and hands over `db` instead of the handler reading it." authoring-surface.md is
categorical — env vars "terminate at the host's hydration step — user code never
reads them" and "MakerKit propagates data to user code only through dependency
injection." PORT is a host/serving concern, and here the user service reads it
straight from the environment.

On a strict reading the DoD ("the handler contains zero `process.env`") is met —
the token sits at module scope, not inside the handler closure — but that's a
technicality; the spirit is violated, and the spec's own sketch (spec.md:12) uses
a bare bound `PORT`, not `process.env`. The port is already known to the control
plane: `lower(..., { port: 3000 })` sets the Deployment `portMapping.http`, and the
MVP established Compute injects `PORT` into the VM. So the host shim is the right
place to resolve it.

Context (not a fault of this PR): the ported `storefront-auth/hexes/auth` reads
`process.env.PORT` the same way, and this slice deliberately defers the
Output/serving model, so there is no serving abstraction yet to carry the port.

**Fix (pick one, in this PR):**
- Preferred: have `runHost` read `PORT` at the boundary and pass it to the handler
  — e.g. inject a serving context alongside the hydrated deps, or set a
  shim-owned binding the handler reads through DI rather than `process.env`. Keeps
  env strictly at the host.
- Minimum: if a serving handle is genuinely out of scope for Slice 1, add one line
  to the service's doc comment stating that `PORT` is the one env read still owned
  by user code because the Output/serving model is deferred, and that it moves to
  the shim in the serving slice — so the exception is deliberate and recorded, not
  an oversight the next reader copies.

### F2 — No test guards the control/execution import boundary — **Medium**

The tree-shaking split (`.` must not pull Alchemy/Effect/prisma-alchemy/Bun.SQL
into a user service bundle) is the most foundational property of the slice and the
whole project builds on it, yet nothing in the suite asserts it. I verified it
holds today by bundling the `.` entry (6 modules, 1.63 KB, zero leakage), but a
stray value import — e.g. someone changing a `import type` in `descriptors.ts` to a
value import, or `load.ts` importing from `lower.ts` — would silently reintroduce
the bundle and no test would catch it.

**Fix (in this PR):** add one test that bundles the `.` entry and asserts the
output is free of the control/execution planes. A minimal, dependency-free version:

```ts
import { test, expect } from "bun:test";
test("the '.' authoring entry pulls in no control/execution plane", async () => {
  const out = await Bun.build({
    entrypoints: [import.meta.dir + "/../index.ts"],
    target: "bun",
  });
  const js = await out.outputs[0].text();
  for (const tok of ["alchemy", "effect", "prisma-alchemy", "new SQL(", "ProviderCollection"]) {
    expect(js).not.toContain(tok);
  }
});
```

### F3 — `runHost` hydrates without running Load's validation — **Low**

`runHost` (`src/runtime/host.ts:23`) iterates `service.dependencies` directly and
dispatches to `hydrateDescriptor`; it never calls `Load` / `isDescriptor`.
authoring-surface.md states integrity is "validated at Load before any Hydrate."
In practice `hydrateDescriptor`'s exhaustive `switch` still throws on an unknown or
malformed `kind`, so nothing unsafe hydrates — the failure just surfaces as "no
runtime hydrator for kind X" rather than a clean Load error, and a descriptor
that is not an object at all would throw on `.kind` access. Not a correctness bug;
a consistency gap with the stated lifecycle.

**Fix (optional, in this PR):** either call `Load(service)` at the top of `runHost`
and iterate `graph.inputs` (one line, aligns the shim with the documented
Load-before-Hydrate order and gives a uniform error), or leave as-is and note in
the `runHost` doc comment that validation is delegated to each hydrator. The
former is cleaner and nearly free.

### F4 — Transient `.makerkit-host-entry.<pid>.ts` is not gitignored — **Low**

`src/build/artifact.ts:53` writes the shim entry beside the user service and
removes it in a `finally`. Normal runs leave no trace (verified: clean tree after
`pnpm build`). But if the build is hard-killed (SIGKILL/power loss) between write
and cleanup, a `.makerkit-host-entry.<pid>.ts` is left in the user's *source*
directory, where it can be committed by accident. It is not covered by any
`.gitignore`.

Separately, the cleanup removes `${entryFile}.map` (line 87), but with
`outdir: staging` Bun writes the sourcemap to `staging/index.js.map`, not beside
the entry — so that `rm` targets a file that never exists. Harmless, but dead.

**Fix (in this PR):** add `.makerkit-host-entry.*.ts` to the repo root `.gitignore`
(cheap insurance against the crash case), and drop the dead `${entryFile}.map`
removal (or, if you want the map cleaned, remove it from `staging`).

### F5 — `describe()` can throw on the value it's trying to describe — **Low**

`src/load.ts:54` — `LoadError`'s message builder does `JSON.stringify(value)` for
objects. A malformed descriptor containing a `BigInt` or a circular reference makes
`JSON.stringify` throw, replacing the intended clear `LoadError` with an opaque
`TypeError`. Narrow edge, but this is the error path whose entire job is a clear
message.

**Fix (in this PR):** wrap the `JSON.stringify` in a try/catch and fall back to
`String(value)` / `Object.prototype.toString`.

---

## Implementer's flagged architectural items

### (a) `const providers = Prisma.providers() as never` — **ACCEPTABLE as-is**

I reproduced the error by removing the cast: Alchemy's `Stack` types the `providers`
Layer's success channel against `NoInfer<Provider<Project|ComputeService|Deployment>>`
(the per-resource requirements inferred from the effect body), but
`Prisma.providers()` returns `Layer<PrismaCredentials | ManagementClient | Providers>`
— a `ProviderCollection` plus client/creds context that does not structurally unify
with the individual `Provider<T>` requirements. Crucially, the **same error occurs
verbatim in `examples/smoke/alchemy.run.ts`** when typechecked — the two
hand-written `alchemy.run.ts` files only "pass" because they have no typecheck
script. So this is a genuine, pre-existing typings gap in `prisma-alchemy`'s
`providers()` return type, not something `lower.ts` introduced or can properly fix
locally. The real fix belongs in `prisma-alchemy` (out of scope for this PR — noted
as context). `lower.ts` is in fact the *only* typechecked caller, so the one
isolated, well-commented cast is the right local call.

Optional polish (not required): cast to the parameter's expected Layer type rather
than `never`, so the assertion is scoped to the known shape instead of erasing all
type information at that position. Not worth blocking on.

### (b) Transient `.makerkit-host-entry.<pid>.ts` beside the user service — **ACCEPTABLE, with F4**

The approach is sound and the reasoning in the comment is correct: writing the
entry next to the service is what lets Bun resolve `@makerkit/core/runtime` and the
service's own deps through the real `node_modules`; a temp-dir entry would not
resolve. PID-suffixing avoids collisions between concurrent builds, and cleanup is
in a `finally`. The only gaps are the crash-safety / gitignore point and the dead
`.map` removal — see F4. The mechanism itself does not need rework.

### (c) Phantom `hydratedType?: SQL` on the descriptor — **SOUND, does not leak the plane split**

Verified at the type level: with `Hydrated<D> = NonNullable<D["hydratedType"]>`, a
handler written as `({ db }) => …` sees `db: SQL` — a `const _bad: number = db`
fails to compile (proving it is genuinely `SQL`, not `any`/`unknown`) and
`db\`select 1\`` typechecks. The field is `type`-only: `import type { SQL } from "bun"`
is erased, and I confirmed by bundling the `.` entry that no Bun.SQL value crosses
into the control plane. So the type flows to the handler without dragging runtime
code across the split — this is the right way to give the authoring surface a typed
client while keeping descriptors pure data. Sound.

### (d) `lower(service, opts)` taking identity/artifact via `opts`, env only in `alchemy.run.ts` — **RIGHT boundary**

Correct separation. `LowerOptions` carries exactly what the graph cannot
(`workspaceId`, `name`, `region`, `artifactPath`, `artifactHash`, `port`), the
mapping (`toResourcePlan`) is pure and unit-tested as data, and `process.env` reads
(`PRISMA_WORKSPACE_ID`) live only in the example's `alchemy.run.ts` — the deploy
driver, not the core package. This matches design-notes.md's "env-var names by
convention; the control plane reads env at deploy." `@makerkit/core` stays free of
ambient config. Right boundary.

---

## Test coverage vs. slice DoD

Solid where it counts, with the gaps above:

- **Well covered:** `defineService` handle shape + inertness; import-time
  side-effect freedom (fixture); `Load` build/validate/reject + malformed-module
  fixture; `toResourcePlan` mapping, defaults, overrides, unknown-kind rejection,
  no-handler-run; `runHost` hydrate-and-call, per-dep keying, missing-URL error,
  non-handle rejection; `hydratePostgres` / `hydrateDescriptor` client shape;
  artifact build round-trips a real `.tar.gz` and asserts the shim + user marker
  are bundled.
- **Gaps:**
  - **The import-boundary/tree-shaking property is untested** (F2) — the highest-
    value gap given the whole project rests on the split.
  - **`lower()` itself is untested** — only `toResourcePlan` is. The `as never`
    cast means a future `prisma-alchemy` signature change could pass typecheck and
    silently mis-wire the Stack. Acceptable to defer the real assertion to 1c (the
    deploy), but note it: a smoke-level "the returned Stack has the three
    resources" test would catch regressions without deploying.
  - Minor: no test for the `describe()` throw path (F5) or the crash-leftover
    entry file (F4) — low priority.

None of these block 1c's deploy. F1 and F2 are the two worth landing in this PR.
