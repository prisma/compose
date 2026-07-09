# Deploy CLI MVP — Design Notes

The design itself lives in ADR-0003…0006 and
`docs/design/10-domains/deploy-cli.md`. This file records the
implementation-level calls made at project shaping, the contracts as the
implementer will meet them, and the risk register.

## Implementation calls (settled with operator, 2026-07-09)

1. **CLI runtime: runtime-agnostic bin, node + bun.** Lots of node users to
   serve. The CLI and assembly code use **no bun-only APIs**; `npx makerkit`
   and `bunx makerkit` both work. Importing the user's `.ts` entry needs
   Node ≥ 22.18 (type stripping on by default) — document, no loader shim in
   MVP. Inherent caveat (not a CLI limitation): an app whose service module
   imports bun APIs (e.g. hello's `import { SQL } from "bun"`) can only
   deploy under bun, since Load imports that module. Proof split: the CLI
   package's test suite runs under node (proving node compat); the live e2e
   proof runs under bun (both examples are bun apps). A node example app is a
   follow-up. deno: out of scope.
2. **Driving Alchemy: generate a runnable stack file, shell to `alchemy`.**
   The CLI writes its computed correlation (assembled bundle dirs, name,
   stage) as a small, human-readable stack module at a stable gitignored path
   — `.makerkit/alchemy.run.ts` — regenerated every run, then shells to
   `alchemy deploy` / `alchemy destroy` against it. Rationale: the generated
   file is inspectable and independently runnable (bisect CLI bugs vs alchemy
   bugs by running `alchemy deploy` on it directly), and it avoids the
   unverified programmatic engine entry at `2.0.0-beta.59` entirely. Error
   output prints the generated file's path. (This removes the probe dispatch
   from S3.)
3. **No default entry.** `makerkit deploy <entry>` requires the path in the
   MVP; bare invocation errors with usage. A discovery convention (e.g. a
   `package.json` field) can come later without breaking anything.
4. **Env loading.** The CLI does not source `.env` itself in the MVP; it reads
   the process environment (CI exports secrets; local dev uses the existing
   `set -a; . .env` habit or direnv). Revisit only if it hurts.

## The contracts, implementer-facing

### Node identity (core)

`NodeBase` gains `name: string` (every node, ADR-0006) and the pack package
name (ADR-0003 inference; field name to settle in-slice, e.g. `pack:
"@makerkit/prisma-cloud"`, set by pack factories). `ServiceNode` gains
`url: string` (ADR-0004, from `import.meta.url`). All plain frozen data;
`url`/`pack` are deploy-time metadata, inert at runtime. Factories
(`compute`, `postgres`, `http`, `hex` already named) thread them through.
`Load` rejects a root service with unwired connection inputs, naming the input
and pointing at the composing hex.

### Pack CLI seam (`@makerkit/prisma-cloud/target`)

```ts
export function fromEnv(): Target  // reads PRISMA_WORKSPACE_ID (+ region opt),
                                   // throws naming any missing variable
```

The CLI: collect `pack` over the loaded graph → exactly one → dynamic
`import(`${pack}/target`)` → `fromEnv()`. Mixed packs → error listing them.

### Assembly (`@makerkit/node/assemble`, `@makerkit/nextjs/assemble`)

```ts
assemble(input: { serviceDir: string; build: BuildAdapter }): Promise<AssembledBundle> // { dir, entry }
```

- `serviceDir` = nearest `package.json` above the node's `url`.
- `node` kind: absorb `examples/makerkit-hello/tsdown.config.ts`'s shape —
  validate the app's built `entry` exists; bundle the service module →
  `main.mjs` (the wrapper: separate build, `@makerkit/*` inlined, `bun`
  external — run/load must be separate module instances).
- `nextjs` kind: absorb `examples/storefront-auth/scripts/bundle-next.ts`
  wholesale — standalone-dir location, hoisted `node_modules` + static +
  `public/` copies, `bunfig.toml` auto-install guard, wrapper bundle.
- Wrapper bundling needs the *service module path* — that is exactly the
  node's `url`; no extra input.
- Descriptor entries (`@makerkit/node` root) stay pure data; `/assemble` is a
  separate deploy-only export path (mirrors the pack's light/`/target` split).

### CLI (`packages/makerkit-cli`, bin `makerkit`)

`deploy [entry] [--name] [--stage]`, `destroy [entry] [--name] [--stage]`.
Pipeline per deploy-cli.md § The pipeline. Feeds assembled bundles to
`lower()` via the existing `LowerOptions.bundle(s)` carrier (kept as internal
plumbing + mixed-stack escape hatch; no longer user-facing).

## Risks

- **Node `.ts` import edges** — type stripping covers erasable syntax only;
  an entry module using enums/namespaces fails under node. Acceptable: error
  is Node's own and clear; bun covers the rest.
- **Wrapper bundling resolution** — the wrapper resolves user deps from the
  service dir; pnpm isolated layouts already forced a hoisting workaround for
  Next (`.npmrc`). Contained: same behavior as the interim scripts being
  absorbed, now in package code where a fix lands once.
- **`rpc-contracts` collision** — that track is docs-only today but owns
  `http.ts`/interface semantics. Our core edits stay on node identity, Load
  errors, and deploy options. Coordinate merge order if it starts code.
- **CI secrets surface** — the e2e workflow switch must keep
  `PRISMA_SERVICE_TOKEN`/`ALCHEMY_PASSWORD` handling as-is; only the commands
  change.

## Superseded material

`.drive/projects/authoring-layer/makerkit-deploy-cli-brief.md` was the
pre-design brief. Its open questions are settled: §1 config file → dropped
(ADR-0003); §3 value→location → `url: import.meta.url` (ADR-0004); §4 build
orchestration → users build first (ADR-0005). Its invariants, security
constraints, e2e proof shape, and determinism caveat are absorbed into the
spec here.
