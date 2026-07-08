# Slice R5 — authoring-surface redesign (`compute({deps,build})`, `run`/`load`, build adapters)

Exhaustive design for the R5 retrofit. The **contract** is
[`docs/design/10-domains/core-model.md`](../../../../docs/design/10-domains/core-model.md)
(rewritten for this slice); this note records *why* the model is shaped this way,
the mechanics that need care, and the concrete retrofit of the already-delivered R4.
Design-notes [decision 11](../../design-notes.md) is the one-paragraph summary.

## The two problems this solves

R4 shipped and proved live, but the discussion that produced it left two warts the
storefront exposed:

1. **The framework-DI gap.** A Next Server Component can't be handed the hydrated
   `auth` client — the R4 service handler just boots Next and blocks, and the page
   runs in Next's own module graph. So `page.tsx` read
   `process.env.STOREFRONT_AUTH_URL` directly, hardcoding the connection's
   *physical* key and reaching around the framework's DI. R4 documented this as an
   accepted wart pending a `use()` primitive.

2. **Packaging fragility.** Because the R4 service module carried the serve code
   (`await import('./server.js')`), and the Next page needed to import the service
   (to pull config), the two formed an import cycle. It "worked" only through a
   non-literal `serverModule` string that hid the edge from *both* bundlers, plus a
   keep-alive `Promise` and in-service error handlers. A design that only works
   because the compiler and bundlers can't see what it does is fragile by
   construction.

Both dissolve when the service stops being a program and becomes a description.

## The settled model

**The service is declarations only.** `compute({ deps, build })` — no handler. It
carries `run` and `load`. The code that serves is the app's own **entrypoint**,
which the app author writes AND bundles themselves (Hono → their bundler; Next →
`next build`). MakerKit never bundles app code.

**`run(address, boot)` — the process controller.** At boot the pack-printed
bootstrap calls it. `run`:
1. deserializes this service's env into a typed `Config` (address-keyed — the
   pack's single sanctioned env read);
2. re-emits that config under **address-free, process-local stash keys**;
3. calls `boot()` — a printed `() => import("./server.js")` — to start the app's
   entry.
`run` never hydrates and never calls app code. It sets up the process and hands off.

**`load()` — pull-DI, from inside the app's entry.** It reads the stash into the
typed `Config`, hydrates each input via core's `hydrate`, **memoizes** per process,
and returns the merged `{ ...deps, ...params }`. No address, no env keys, no
framework knowledge. Typed end to end by `postgres()`/`http()` → `compute()` →
`load()`.

**Why this is coherent:**
- *run-before-load is structural.* The app entry only runs because `run` booted it,
  and `run` stashed before booting. `load()` can never precede `run()` in the
  deployed artifact. (Build/prerender is the exception — see Mechanics.)
- *The cycle is gone.* Serve code left `service.ts` for the app's entry, so
  `service.ts` never references `server.js`. The app entry imports `service.ts` (for
  `load()`); the bootstrap imports the wrapper and dynamically imports the entry;
  nothing imports the bootstrap. Acyclic — the tools see the whole graph. No
  non-literal trick, no keep-alive, no in-service error handlers.
- *Framework-DI gap closed.* The Next page calls `service.load()` — the SAME
  mechanism the Hono entry uses. It names the logical input `auth`, not the physical
  key. The `use()` primitive is subsumed.

**Build is a two-piece adapter — the ecosystem seam.**
- *Authoring descriptor* (lean, rides in `service.ts`): `node({ entry })` /
  `nextjs()` → `{ kind, entry }`. `entry` is service-dir-relative, never a machine
  path.
- *Deploy-side assembler* (`@makerkit/<adapter>/assemble`, heavy, deploy machine):
  normalizes the app's built output into a bundle dir containing the MakerKit
  wrapper (`service.ts` bundled, core inlined once, entry left to a runtime dynamic
  import) and reports the runtime entry. `node` = trivial placement; `nextjs` = the
  standalone fixups (hoisted `node_modules`, `.next/static`, `public`, bunfig
  auto-install off — PRO-213). The runtime shape is identical across adapters
  (`run(address, () => import(entry))`); only assembly differs.

## Mechanics that need care

- **The stash medium is env.** `run` re-emits config under address-free keys in
  `process.env` because a process global would not survive a framework worker/child
  fork (Next may fork); env is inherited. Scrub/write only the MakerKit surface;
  leave what the runtime needs (`PORT`, `NODE_ENV`). The medium is private to the
  pack behind `run`/`load` — swappable without any app or core awareness.
- **`load()` memoizes per process.** Hydration (opening a DB connection, building
  the fetch client) happens once per process on first `load()` and is cached; a Next
  page calling `load()` per request gets the cached clients, not a new connection
  each time. The memo lives in the app-bundle copy of the service module (the copy
  the entry imports).
- **Two copies of `service.ts`, both pure.** The app's bundler inlines a copy into
  the app entry; the assembler inlines another into the wrapper. `run` (wrapper
  copy) stashes; `load` (app copy) reads env + hydrates. They share only the env
  stash (strings) — no shared object identity is required, so duplication is
  correct, exactly as the Next page + wrapper already were in R4.
- **`load()` at build/prerender.** A Next page calling `load()` during `next build`
  prerender has no `run()` in the process, so the stash is absent → `load()` fails
  loudly. Pages that call `load()` opt out (`export const dynamic = "force-dynamic"`);
  local dev supplies the stash via a dev harness. This is the one place the
  run-before-load coupling leaks, and it is handled explicitly.
- **The bootstrap boot import is printed, not bundled.** `package` prints
  `main.run("<address>", () => import("<entry>"))` with a literal path — printed
  code, never a bundled reference, so no bundler follows it and the R4 non-literal
  trick is unnecessary.
- **Determinism.** The wrapper + printed bootstrap are deterministic; the Next
  standalone still embeds a per-build `BUILD_ID`, so a Next service may re-version on
  redeploy — the deterministic-artifact follow-up is unchanged, and the e2e keeps no
  idempotence assertion for the Next path.

## The retrofit — what changes vs R4

- **core `.`**: `ServiceNode` drops `invoke`, gains `readonly build: BuildAdapter`.
  Add the `BuildAdapter` type and `Loaded<D,P>`. `service()` takes `build` instead of
  `handler`. `hydrate` stays (now serves `load`). `configOf` unchanged. `ServiceHandler`
  removed.
- **core `/deploy`**: `PackageInput` becomes `{ assembled: AssembledBundle, address }`
  (was `{ bundle, address }`); add `AssembledBundle { dir, entry }`. `package`'s
  contract: print the bootstrap with the boot import + assemble from the adapter's
  normalized dir. `LowerOptions.bundle(s)` stay as the **interim** carrier of
  already-assembled dirs (the CLI drops them). Sequencing unchanged.
- **pack authoring (`@makerkit/prisma-cloud`)**: `compute({ deps, build })` returns
  the runnable/loadable subclass — `run(address, boot)` (deserialize → stash → boot)
  and `load()` (deserialize stash → hydrate → memoize). The serializer gains the
  address-free direction (`stash` / read-stash via `configKey("", d)`). `http()`,
  `postgres()` unchanged.
- **pack `/target`**: `package` consumes `assembled` and prints the boot-import
  bootstrap. provision/serialize/deploy unchanged. Postgres DSN reads
  `endpoints.direct.connectionString` (PRO-212) — already fixed in R4, keep.
- **NEW packages `@makerkit/node`, `@makerkit/nextjs`**: the descriptor entry
  (lean) + the `/assemble` entry (heavy). `nextjs/assemble` absorbs the existing
  `examples/storefront-auth/scripts/bundle-next.ts` logic; `node/assemble` is the
  trivial case.
- **examples (`examples/storefront-auth`)**:
  - `auth`: `service.ts` → `compute({ deps: { db }, build: node({ entry: "dist/server.js" }) })`
    (declarations only); NEW `server.ts` = the app's entry (`const { db, port } =
    service.load()`; build Hono; `Bun.serve`), bundled by the example's own build.
  - `storefront`: `service.ts` → `compute({ deps: { auth }, build: nextjs() })`;
    `app/page.tsx` uses `service.load()` (was `process.env.STOREFRONT_AUTH_URL`);
    the `service.ts` serve/keep-alive code and the `serverModule` trick are deleted.
  - the interim `alchemy.run.ts` stays (until the CLI) but its bundles now come from
    the adapters' assemblers.
- **tests**: the invariant guards extend to the adapter descriptor entries (lean)
  and exempt `/assemble` (deploy-only, may use `node:fs`). The serialize↔deserialize
  round-trip test gains the address-free stash direction (`serialize`(addr) →
  `run` re-key → `load` read identity). Remove `invoke`-based handler tests; add a
  `load()`-returns-typed-memoized-deps test.

## Deploy proof (re-prove live)

Both services on the new shape, deployed to real Prisma Cloud, storefront renders
`Auth /verify says: 200 {"ok":true}` — the same headline as R4, now with the page
pulling via `load()` and no service-side serve cycle. Destroy clean. The e2e
workflow already deploys `storefront-auth`; it keeps the round-trip assertion and
(correctly) no idempotence assertion for the Next path.

## Out of scope

Typed connection interfaces / generated clients; full hex composition; the
`makerkit deploy` CLI (the interim `alchemy.run.ts` + bundle map stay); the
deterministic Next-standalone artifact; runtime name lookup. All named extension
points in core-model.md.

## References

- `docs/design/10-domains/core-model.md` (the rewritten contract)
- `design-notes.md` decision 11 (summary) · decisions 8–10 (what R5 evolves)
- R4 slice (`../r4-connection-primitive/`) — the delivered baseline being retrofit
