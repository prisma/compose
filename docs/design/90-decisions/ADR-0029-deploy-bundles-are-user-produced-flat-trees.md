# ADR-0029: Deploy bundles are user-produced flat trees; the framework only wraps

## Status

Accepted

## Decision

The deploy artifact contract is: **the user's build hands the framework a
finished, flat, self-contained bundle; the framework wraps it in its bootstrap
and ships it.** The framework never produces, repairs, infers, or interprets
the bundle's internals. Three binding corollaries:

1. **No path-string arithmetic, no filesystem-derived identity.** The
   framework never guesses an output filename, never derives a name from a
   module path's basename, and never encodes an absolute deploy-machine path
   into an artifact. Where the framework builds its own wrapper, it *dictates*
   the output name (tsdown object entry → `main.mjs`) instead of discovering
   it. Where uniqueness is needed (artifact staging), the key is the node's
   **graph address** — already collision-free by construction (provision ids
   reject `_` and `.` inside segments, so joined addresses cannot alias).
   Staging lives in a deploy-owned directory
   (`.prisma-compose/artifacts/<address>/`), never inside `node_modules` and
   never inside the user's build output.

2. **No layout inference.** Where the bundle lives is the **user's input**,
   not the framework's deduction. The nextjs adapter takes the path to the
   standalone app directory as supplied (relative resolves against
   `dirname(module)`, absolute passes through, no provenance validation) —
   it does not compute a monorepo root, at any depth, by any heuristic.

3. **A flat bundle is the contract; a symlink in a bundle is a hard error.**
   The packager rejects it at package time, naming the offending path and the
   fix ("materialize links in your build, e.g. `cp -RL`"). The framework does
   not dereference, does not represent links in the artifact, does not detect
   cycles, does not check containment — a framework that launders trees owns
   every pathology of every package manager forever. Producing a flat tree is
   the job of whoever chose the layout: the user's build.

## Reasoning

The first real out-of-repo deploy (datahub, 2026-07-13) failed three times in
the deploy path, and all three failures share one root cause: the framework
guessing facts that belong to the user or to explicit configuration
(`.drive/projects/forcing-function-apps/bugs-deploy-assembly.md` has the full
evidence):

- The node assembler guessed the bundle's emitted filename
  (`/^service\.m?js$/`) — wrong for any module not named `service.ts`,
  breaking every `cron()` deploy.
- The nextjs assembler guessed the monorepo root as exactly four directories
  above the app — wrong for any layout but the framework's own examples.
- The packager walked the user's tree and read symlinks as files — `EISDIR`
  on every bun/pnpm-shaped `node_modules`.

Beyond breakage, guessing is a security hazard: a symlink escaping the repo
(planted by a compromised postinstall, or plain accident) would, under
"helpful" dereferencing, silently package arbitrary deploy-machine files —
`~/.aws`, ssh keys — into the artifact. Absolute paths in artifacts encode the
deploy machine's filesystem into what ships. A thin contract eliminates the
class: the framework touches only what the user explicitly handed it, errors
loudly on anything that isn't a plain file tree, and adds exactly one thing of
its own (the bootstrap wrapper).

## Consequences

- `cron()` modules deploy: the scheduler's wrapper is named by dictation, not
  found by pattern.
- Any monorepo layout deploys: the user states where the standalone is.
- bun/pnpm-built Next standalone trees **fail fast** with an actionable error;
  those apps add a flatten step to their own build. datahub gains one.
- The deterministic tar writer stays trivial: regular files only.
- Deploy no longer writes into `node_modules` (previously: the cron
  scheduler's wrapper bundle landed inside the installed package's `dist/`).

## Alternatives considered

- **Derive the bundle name from the module basename** (path arithmetic).
  Rejected: still filesystem-derived identity; the name is ours to dictate.
- **Discover the standalone dir by globbing for the entry file.** Rejected:
  inference is the root cause, not the cure; ambiguous on multi-app trees.
- **Fixed-depth monorepo root** (status quo). Rejected: encodes one repo
  layout into the framework.
- **Represent symlinks as USTAR symlink entries.** Rejected: assumes the
  platform extractor honors them, and ships the link-escape hazard to the VM.
- **Dereference symlinks with containment + cycle detection.** Rejected: the
  framework becomes a tree-laundering machine owning every package manager's
  layout pathologies; complexity belongs to whoever chose the layout.

## Related

- [`ADR-0005`](ADR-0005-users-build-the-framework-assembles.md) — users build,
  the framework assembles; this ADR extends the same ownership to the bundle's
  shape.
- [`ADR-0004`](ADR-0004-paths-resolve-relative-to-the-authoring-file.md) — the
  path-resolution rule the user-supplied bundle path follows.
- `.drive/projects/forcing-function-apps/bugs-deploy-assembly.md` — the live
  deploy evidence that forced the decision (transient; summary above is
  self-contained).
