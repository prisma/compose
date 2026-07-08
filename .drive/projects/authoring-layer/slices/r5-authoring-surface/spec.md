# Slice R5 — authoring-surface redesign (`compute({deps,build})`, `run`/`load`, build adapters)

## At a glance

```ts
// auth/src/service.ts — declarations only; no handler
import { compute, postgres } from "@makerkit/prisma-cloud"
import node from "@makerkit/node"
const db = postgres({ client: ({ url }) => new SQL({ url }) })
export default compute({ deps: { db }, build: node({ entry: "dist/server.js" }) })

// auth/src/server.ts — the app's OWN entry; the app bundles it to dist/server.js
import service from "./service"
const { db, port } = service.load()              // typed: db: SQL, port: number
Bun.serve({ port, hostname: "0.0.0.0",
  fetch: async () => Response.json(await db`select 1`) })

// storefront/app/page.tsx — the Next page pulls typed deps the SAME way
const { auth } = service.load()                  // was process.env.STOREFRONT_AUTH_URL
```

The service stops being a program. The import cycle, the non-literal `serverModule`
trick, the keep-alive `Promise`, and the Next page's direct `process.env` read all
die. The framework-DI gap closes: `load()` is the one pull mechanism for both a Hono
entry and a Next page.

## Chosen design

**The contract is the rewritten `core-model.md` on this branch (decision 11)** plus
[`design-note.md`](design-note.md): service = declarations (`compute({deps,build})`,
no handler); `run(address, boot)` (resolve → stash → boot) and `load()` (read stash
→ hydrate → memoize, typed); the app owns and bundles its entry; the two-piece build
adapter (descriptor + `/assemble`). Deviations amend the docs with the operator
first — unchanged covenant.

## Coherence rationale

One PR, reviewable as "does the built system match the rewritten design": the core
node reshape (drop `invoke`, add `build`), the pack's `run`/`load`/stash, two new
adapter packages, and the two examples refactored + re-proven live. Large but a
single coherent story (it retrofits R4's model); the review loop's per-dispatch
structure keeps each sitting bounded.

## Scope

Full design is [`design-note.md`](design-note.md); contract is core-model.md.

**In:**
- **core `.`**: `ServiceNode` drops `invoke`, gains `readonly build: BuildAdapter`;
  add `BuildAdapter` + `Loaded<D,P>` types; `service()` takes `build` not `handler`;
  remove `ServiceHandler`. `hydrate`/`configOf` unchanged (hydrate now serves
  `load`).
- **core `/deploy`**: `PackageInput` → `{ assembled: AssembledBundle, address }`;
  add `AssembledBundle { dir, entry }`; `package` prints the bootstrap with the boot
  import (`() => import(entry)`). `LowerOptions.bundle(s)` stay as the interim
  assembled-dir carrier. Sequencing unchanged.
- **pack authoring**: `compute({ deps, build })` returns the runnable/loadable
  subclass — `run(address, boot)` = deserialize (pack's one env read) → stash
  (address-free re-emit) → `boot()`; `load()` = read stash → core `hydrate` →
  memoize → typed merged deps/params. Serializer gains the address-free direction
  (`configKey("", d)`).
- **pack `/target`**: `package` consumes `assembled`, prints
  `main.run(address, () => import(entry))`. provision/serialize/deploy unchanged.
- **NEW `@makerkit/node` + `@makerkit/nextjs`**: descriptor entry (lean:
  `{ kind, entry }`) + `/assemble` entry (heavy: normalize app build → bundle dir +
  wrapper, report entry). `nextjs/assemble` absorbs `scripts/bundle-next.ts`.
- **examples (`examples/storefront-auth`)**: `auth` → declarations + `server.ts`
  entry using `load()`; `storefront` → declarations + `page.tsx` using `load()`
  (delete the `process.env` read, the `serverModule` trick, the keep-alive, the
  in-service error handlers). Interim `alchemy.run.ts` stays; its bundles come from
  the assemblers.
- **tests**: invariant guards extend to the descriptor entries, exempt `/assemble`;
  round-trip test gains the stash direction; drop `invoke` handler tests; add a
  `load()` typed-memoized test.
- **Deploy proof**: both services on the new shape, live on real Prisma Cloud,
  storefront renders `Auth /verify says: 200 {"ok":true}`; destroy clean.

**Out:** typed connection interfaces / generated clients; full hex composition; the
`makerkit deploy` CLI (interim `alchemy.run.ts` + bundle map stay); deterministic
Next-standalone artifact; runtime name lookup.

## Pre-investigated edge cases

- **Stash medium = env, not a global** — a Next worker/child fork wouldn't inherit a
  global; env is inherited. Scrub only the MakerKit surface, keep `PORT`/`NODE_ENV`.
- **`load()` memoizes per process** — else a per-request Next `load()` opens a DB
  connection per request. Cache in the app-bundle copy of the service module.
- **`load()` at prerender** — no `run()` in the process → stash absent → loud
  failure. Pages using `load()` are `force-dynamic`; dev supplies the stash.
- **No import cycle to reintroduce** — keep serve code OUT of `service.ts`; the
  bootstrap's boot import is *printed* (literal path), never bundled.
- **Two pure copies of `service.ts`** — app-bundle copy (`load`) + wrapper copy
  (`run`) share only the env stash; no shared object identity required.
- **Determinism** — Next `BUILD_ID` is non-deterministic; the e2e keeps NO
  idempotence assertion for the Next path (the deterministic-artifact follow-up
  owns it).
- **Invariant guards** — descriptor entries stay lean (no `node:`/`alchemy`);
  `/assemble` is deploy-only and exempt.

## Slice-DoD

The At-a-glance code deploys the live system; the storefront renders the round trip
via `service.load()` (no service-side serve cycle, no `process.env` read in the
page); both services on the new authoring shape; the non-literal trick / keep-alive
/ in-service error handlers are gone; all gates + invariant guards green; docs
already match (built to contract); PR open (this branch — retitle #10 at DoD),
review loop complete.

## Open questions

None pinned open — anything the build forces goes doc-first, as before.

## References

- `docs/design/10-domains/core-model.md` (contract, decision 11) · `design-note.md`
- `design-notes.md` decision 11 · decisions 8–10 (what R5 evolves)
- R4 slice (`../r4-connection-primitive/`) — the delivered baseline being retrofit
