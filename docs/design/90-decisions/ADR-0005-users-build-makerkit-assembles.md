# ADR-0005: Users build their app; MakerKit assembles deploy artifacts from built output

## Status

Accepted

## Decision

MakerKit never initiates or configures a user's build. The contract is: **built
output exists before `makerkit deploy` runs** — produced by the user's own
tooling (their bundler config, their package scripts, turborepo). Downstream of
that boundary, the deploy artifact is MakerKit's to manufacture however it
likes: per-adapter-kind **assembly** locates and validates the built output,
applies MakerKit's envelope — including bundling the internal boot wrapper —
and hands a normalized bundle to lowering.

## Reasoning

The line to hold is between two build systems that must not entangle. The
user's build turns their source into their runnable — `next build`, their own
tsdown/esbuild config, orchestrated by their scripts or a monorepo tool like
turborepo. MakerKit competing with or wrapping those tools is a losing
proposition: every bundler option we'd mediate is a support surface, and
monorepo tools already own build ordering and caching. So MakerKit consumes
build outputs; it does not produce them. With turborepo the idiomatic flow is a
deploy task depending on build tasks; without it, "run your build, then
`makerkit deploy`".

Downstream of the user's output, though, the deploy artifact is MakerKit's
domain — and that includes running our own fixed bundler invocation where the
envelope needs one. The **wrapper** is the case in point: the service module
bundled to `main.mjs`, whose `run()` boots before the app's entry (resolve
serialized config from env → stash → import the entry). It is essential to the
boot protocol, and it must stay invisible to users — no app's build should be
complicated by it. Bundling it is not "getting tangled in the user's build
system": the invocation is fixed, internal, and operates at a point where the
user's own bundling is already done. Likewise the framework normalizations
(e.g. making a Next standalone tree self-contained: copying the hoisted
`node_modules`, static assets, `public/`) are deterministic file-shuffling that
belongs to assembly, not to any user-visible build step.

Assembly's other job is validation: built output missing at the adapter's
declared location fails loudly with a "run your build" error before anything
is provisioned.

## Consequences

- The MVP CLI has no build invocation at all — no build-command convention, no
  `--no-build` flag, no build-script discovery. That machinery only becomes a
  question if a `makerkit build` command ever exists.
- We can detect *missing* outputs but not *stale* ones: deploying a forgotten
  old build is possible. Accepted for now; freshness checks are a later nicety.
- The build adapter descriptor's job shrinks to declaring *where the user's
  build puts its output*, never how to produce it.
- The wrapper bundle resolves the user's dependencies (the service module
  imports their client factories), so assembly's bundler invocation must
  resolve from the service's directory — an internal implementation burden we
  accept to keep the wrapper out of userland.

## Alternatives considered

- **MakerKit invokes the package's `build` script** (convention with an
  override) — considered and initially favored; dropped from the MVP because
  consuming outputs is strictly simpler and monorepo tools already own
  orchestration. Can be added later without changing the contract.
- **The user's build produces the wrapper too** — honest, but leaks the boot
  protocol into every app's build config; Next apps would need a second build
  step bolted on.
- **Eliminating the wrapper** (generic pack-owned bootstrap doing the env →
  stash step without the service module) — rejected: the wrapper is essential
  to the boot protocol as designed; `run`/`load` live on the node.

## Related

- [`ADR-0004`](ADR-0004-service-nodes-carry-their-authoring-url.md) — how
  assembly finds the directory it works from.
- [`../10-domains/core-model.md`](../10-domains/core-model.md) — the wrapper's
  role in boot (`run`/`load`).
- [`../10-domains/deploy-cli.md`](../10-domains/deploy-cli.md) — assembly's
  place in the pipeline.
