# Slice: A compute service's own origin is a pack-owned property

## At a glance

A Prisma Compute service always has a platform-assigned public origin
(`https://<serviceId>.<site>.prisma.build`). Today an app that needs its own
origin at boot (open-chat: Better Auth `baseURL`/`trustedOrigins`, Stripe
redirects) must model it as operator config (`envParam("APP_ORIGIN")`), which
forces the FRICTION #9 two-pass workaround: deploy with a placeholder, read
the real URL from the report, PATCH the platform var by hand, force a
redeploy with a throwaway artifact-hash marker. This slice makes the origin a
property the prisma-cloud pack resolves and injects itself — no declaration,
no binding, no operator involvement — and fixes the platform bug (PRO-200)
that made the value unknowable at provision time.

Settled in the 2026-07-21 design session (this session). Supersedes the
draft finding at `wip/slices/self-origin/spec.md` in the
`prisma-compose-demo-app-07178e` worktree. Unblocks **S7 (open-chat port)**
for end-to-end sign-in.

## Chosen design

Two changes, two repos, sequenced:

### 1. pdp-control-plane: create-time endpoint domain is real (fixes PRO-200)

The Management API synthesizes a service's endpoint domain with a hardcoded
`cdg` region whenever `App.endpointDomain` is still null (i.e. before first
promote): `SERVICE_ENDPOINT_REGION = 'cdg'` in
`services/management-api/models/v1/compute.ts` (`fallbackEndpointDomain`),
with a second copy in `packages/interactors/src/compute/domains.ts`. That is
the PRO-200 placeholder — the create response returns a domain on the wrong
region subdomain that 404s until promote.

The domain is deterministic at create: the endpoint scheme is a recorded
platform decision (Ignite ADR-0008 — `<prefix>.<site>.prisma.build`, prefix =
raw service cuid, Management API owns prefix policy), and the region→site map
is platform source of truth (`FOUNDRY_REGION_SITES` in
`packages/foundry-client/src/regions.ts`: `us-east-1→ewr`, `us-west-1→sjc`,
`eu-west-3→cdg`, `eu-central-1→fra`, `ap-northeast-1→nrt`,
`ap-southeast-1→sin`).

Fix: `fallbackEndpointDomain(serviceId, regionId)` composes the domain from
the service id and the region's site via `FOUNDRY_REGION_SITES`, replacing
the hardcoded `cdg` at both copies. The create response's
`serviceEndpointDomain` (and `appEndpointDomain`) then names the real future
endpoint from day one. The PR records the contract this establishes: the
create-time endpoint domain is the domain the service will serve on, not a
placeholder — the compose framework depends on it.

### 2. compose (prisma-cloud pack): the origin is a reserved, framework-written value

Nothing in core; nothing declared by the user. `compute()` is authored from
`@prisma/composer-prisma-cloud`, so the whole feature lives in the pack:

- **Provision handoff.** `ComputeProvisioned`
  (`packages/1-prisma-cloud/1-extensions/target/src/descriptors/compute.ts`)
  gains `endpointDomain: Output<string>` from the `ComputeService` resource —
  the create/observe attribute already returned by
  `packages/1-prisma-cloud/0-lowering/lowering/src/compute/ComputeService.ts`
  (a full `https://…` URL; the observe path returns the promoted value for
  existing services, the create path returns the now-correct fallback after
  change 1).
- **Serialize.** The descriptor's `serialize` unconditionally writes one
  reserved row per compute service — a `COMPOSER_<addr>_…` key via the
  existing `configKey`, value = the `endpointDomain` Output mapped through
  the same `encode('service', …)` a literal param takes (the Output-mapping
  pattern the provider-param loop already uses). No serializer changes: boot's
  existing JSON decode reads it.
- **Runtime.** The pack's boot side validates and stashes the row the way
  `stashProviderParams` does for reserved provider params (ADR-0031's
  channel: target-declared, never in `node.params`, never in `config()`),
  and app code reads it as **`service.origin()`** — a method beside
  `run`/`load`/`config`/`secrets` (settled 2026-07-21 follow-up session).
  It reads the reserved row address-free through the same stash channel and
  memoizes like the others. The vehicle: the pack defines a concrete
  **`ComputeService` class implementing core's `RunnableServiceNode`
  interface**, and `compute()` returns that class. Application code imports
  its own service module and holds the concrete class, so `origin()` is
  visible directly; core only ever sees its own interface. This replaces
  the current object-literal + blindCast + freeze construction in
  `compute.ts` — no intersection types, no cast. A separate accessor is
  ADR-0021-consistent — the origin is neither a dep, a param, nor a
  secret.

**Supply model (settled, closes the former open question):** the framework
supplies the origin in every environment, the same as any other config
value. Deploy writes the row unconditionally at `serialize`; a test harness
supplies it exactly as it supplies other `COMPOSER_*` rows (the streams
entrypoint test already sets `COMPOSER_STORE_URL` etc. this way); the
future local dev loop (S8) will write it because it is the thing binding
the port. There is no fallback and no derivation. A call to `origin()` in
an environment that did not supply the row is the ordinary
missing-required-config failure: a loud error naming the env key. The
error is raised lazily at the `origin()` call, not at `run()`, so existing
services and tests that never read the origin are untouched.

The full file-by-file contract is in § Implementation contract below — it
is binding; deviations go through a design discussion, not implementer
judgment.

The env-freeze ordering is already safe: rows are written at `serialize`,
the version's environment snapshots at deployment-create, and `deploy` runs
after `serialize` — no cycle, no second pass, first deploy included.

**Semantics (settled):** the property means exactly "the platform-assigned
origin of this compute service." An operator-known origin (a provisioned
custom domain) is ordinary config — a plain param bound to a literal or
`envParam` — and is out of scope here. No override path in the property.

## Coherence rationale

One reviewer per repo holds each change in one sitting: the platform PR is a
two-call-site fallback fix plus tests; the compose PR is one descriptor
handoff + one reserved row + one boot accessor + proof. The two PRs are
sequenced (compose depends on the platform fix being live) but each is
independently correct and rollback-able: the platform fix alone repairs the
lying create response for every API consumer; the compose change alone is a
no-op for apps that don't read the property.

## Scope

**In:**

- pdp-control-plane: region-aware `fallbackEndpointDomain` at both copies,
  tests, PR referencing PRO-200.
- compose pack: `ComputeProvisioned.endpointDomain`, the reserved env row in
  `serialize`, boot stash + app-facing accessor, unit/conformance coverage.
- Live proof on real Prisma Cloud: a **fresh** service's first deploy reads
  its own correct origin (the exact shape PRO-200 broke).
- Docs (orchestrator-authored): compose ADR for "a compute service's own
  origin is a target-owned property"; narrow ADR-0032's `appOrigin`/
  `APP_ORIGIN` motivating example (that example is operator config only when
  the origin is operator-known — a custom domain).

**Deliberately out:**

- Any core (`@internal/core`) change. This is prisma-cloud-specific.
- A user-facing declaration or binding (`selfOrigin()` as authoring surface).
  Rejected in design: every compute service has an origin by construction.
- Custom-domain support; operator-known origins stay ordinary params.
- The open-chat port itself (S7 consumes this slice).
- Platform-injected runtime env vars (investigated: the platform injects
  nothing — env goes verbatim to Foundry; would be a new platform feature).

## Pre-investigated edge cases

| Case | Finding |
| --- | --- |
| First deploy of a fresh service | Only correct after change 1 is **live in production** Management API. Compose PR must not merge its live-proof before then; sequencing is explicit in the plan. |
| Existing services (second+ deploy) | `ComputeService` observe path re-GETs the app and returns the promoted `appEndpointDomain` — already correct today, unaffected. |
| Manual `APP_ORIGIN` PATCH (FRICTION #9) | A bare URL in a `COMPOSER_…` row crashes boot (`decode()` JSON-parses service-own rows — proven on dev.18). This slice removes the reason to ever PATCH; no serializer hardening needed. |
| Future branch-endpoint prefixes | Ignite ADR-0008 reserves prefix policy to the Management API and branch encoding will change it. Compose reads the reported domain, so it is insulated; the platform-side fallback formula is the only thing that would need updating, and it lives in the repo that owns the policy. |
| Local dev / tests (no deploy) | The framework supplies the row in every environment (see § Chosen design "Supply model"): harnesses set `COMPOSER_ORIGIN` like any other row; `origin()` on an unsupplied environment is the ordinary loud missing-config error, raised lazily so services that never read it are untouched. |

## Slice-specific done conditions

- A fresh service's first deploy on real Prisma Cloud boots with its own
  origin equal to its actual serving URL (verified by request), then is
  destroyed.
- The FRICTION #9 workaround is demonstrably unnecessary: no manual PATCH, no
  artifact-hash marker, single pass.

## Implementation contract

Binding, per repo, per file. Identifier names, messages, and placement are
part of the contract. Anything genuinely impossible as written is reported
back through discussion mode — it is not adapted silently.

### pdp-control-plane (D1)

All work follows pdp-control-plane's own `CLAUDE.md` (smallest direct
change, no new helpers, `pnpm format` + `pnpm check:types` from the root,
branch/PR naming, `/pr-summary`).

1. **`packages/foundry-client/src/regions.ts`** — add `export` to the
   existing `FOUNDRY_REGION_SITES` const. No other change to the module.
   Verify the symbol is importable as `@pdp/foundry-client` at the two
   consumers below; if the package's export map needs a line for that,
   add exactly that line.
2. **`services/management-api/models/v1/compute.ts`** — change
   `fallbackEndpointDomain` to:

   ```ts
   export function fallbackEndpointDomain(
     serviceId: string,
     regionId: string,
   ): string {
     const site = FOUNDRY_REGION_SITES[regionId] ?? SERVICE_ENDPOINT_REGION;
     return `https://${serviceId}.${site}.prisma.build`;
   }
   ```

   `SERVICE_ENDPOINT_REGION = 'cdg'` stays as the unknown-region fallback
   (a legacy/invalid `regionId` in the DB must not turn a list endpoint
   into a 500). Update the stale comment above it: it no longer says
   "remove once all services have been activated"; it says the fallback
   composes the future endpoint per the platform's endpoint scheme
   (`<serviceId>.<site>.prisma.build`) and that the create-time value is a
   contract consumers (Prisma Composer) rely on. Every call site passes
   the owning record's `regionId` (`toComputeServiceResponse` →
   `service.regionId`; `toAppResponse` → `app.regionId`; the compiler
   enumerates the rest — fix all of them, introduce no default parameter).
3. **`packages/interactors/src/compute/domains.ts`** — same signature
   change to the private `fallbackEndpointDomain`; `resolveCnameTarget`
   passes `service.regionId` (already on `CustomDomainServiceSummary`).
   Import `FOUNDRY_REGION_SITES` from `@pdp/foundry-client` (the module
   already imports from it). The hardcoded
   `switchboard.cdg.prisma.build` last-resort in `deriveSwitchboardTarget`
   stays — it only triggers on an unparseable hostname.
4. **Tests** (Vitest, colocated per repo convention):
   - `toComputeServiceResponse` / `toAppResponse` with
     `endpointDomain: null`, `regionId: 'us-east-1'` →
     `https://<id>.ewr.prisma.build`.
   - Stored `endpointDomain` present → returned verbatim, region ignored.
   - Unknown `regionId` → `cdg` fallback.
   - `resolveCnameTarget` with null `endpointDomain` + `us-east-1` →
     `switchboard.ewr.prisma.build`.
5. **PR** references PRO-200 and states the contract: the pre-promote
   endpoint domain names the domain the service will serve on. Note the
   known limit: if branch-endpoint prefix policy changes (Ignite
   ADR-0008's future branch encoding), this fallback is the one place to
   update.

### compose — `@prisma/composer-prisma-cloud` (D2)

Zero changes outside `packages/1-prisma-cloud/`. If the class refactor
turns out to require a core change (see step 3 fallback), stop and report.

1. **`target/src/serializer.ts`** — the writer/reader pair lives here (the
   module's stated job: writer and reader cannot drift). Add, in the
   reserved-channel region of the file:

   ```ts
   /** The framework-resolved origin row: COMPOSER_<addr>_ORIGIN. Written
    *  unconditionally per compute service at serialize (the service's own
    *  provisioned endpoint URL); never a declared param, never in config(). */
   export const ORIGIN_KEY_NAME = 'ORIGIN';
   ```

   plus a module-private `ORIGIN_ENTRY: ParamEntry = { owner: 'service',
   name: ORIGIN_KEY_NAME, param: { schema: type('string'), optional: true } }`
   (arktype `type`, matching `service-keys.ts` convention) and two exports:

   - `stashOrigin(address: string): void` — mirror of
     `stashProviderParams` for this single entry: read
     `configKey(address, ORIGIN_ENTRY)` through `coerce`, and when a value
     is present re-emit it under `configKey('', ORIGIN_ENTRY)` via
     `encode('service', …)`. Absent row → no-op (`optional: true` makes
     `coerce` return `undefined`).
   - `readOrigin(): string` — read `configKey('', ORIGIN_ENTRY)` through
     `coerce`; `undefined` → throw
     `new Error('this service\'s origin is not available (env COMPOSER_ORIGIN is unset) — a deployed environment writes it automatically; a local harness must supply it like any other config value (set COMPOSER_ORIGIN to the JSON-encoded origin URL).')`;
     otherwise return the (schema-validated string) value.
2. **`target/src/descriptors/compute.ts`**
   - `ComputeProvisioned` gains
     `readonly endpointDomain: Output.Output<string | undefined>;` with a
     doc line noting the inner `undefined` is enforced away at serialize.
   - `provision` returns `endpointDomain: svc.endpointDomain` alongside
     `serviceId`/`projectId`.
   - `serialize`, immediately after the provider-params block and before
     the port read, unconditionally pushes one more
     `Prisma.EnvironmentVariable` row:
     key `configKey(address, { owner: 'service', name: ORIGIN_KEY_NAME })`,
     value

     ```ts
     Output.map(provisioned.endpointDomain, (v) => {
       if (v === undefined) {
         throw new Error(
           `ComputeService for "${address}" reported no endpointDomain at provision — cannot resolve the service's own origin (Management API predates the PRO-200 fix?)`,
         );
       }
       return encode('service', v);
     })
     ```

     same `class`/`branch` fields as the sibling rows. The value is the
     platform's URL **verbatim** (`https://…`, no trailing slash, no
     normalization).
3. **`target/src/compute.ts`** — replace the object-literal +
   `blindCast` + `Object.freeze` construction with a class:

   > **Amended 2026-07-22 (Will, after D2 hit the anticipated wall).** The
   > declaration-merging pattern broke downstream `.d.ts` emit: consumers
   > exporting functions that return `compute(...)` with inferred types
   > (cron's `cronScheduler`, storage's `storageService`, both packages'
   > default-exported nodes) failed with TS4058/TS4082 (core's `NODE`
   > brand "cannot be named") and TS4094 (the class not nameable from the
   > consumer → anonymous structural expansion). These node types were
   > always on the public surface; the old code only emitted cleanly
   > because the return was annotated as core's exported
   > `RunnableServiceNode`. Settled fix, both halves required:
   >
   > - **Core exports `NODE`** (node.ts + exports/index.ts) — a value
   >   export of the existing brand symbol, zero behavior. Sanctioned as
   >   core's own vocabulary, not target logic in core.
   > - The class drops the merged interface and writes an honest
   >   `implements RunnableServiceNode<D, P & ReservedParams, E, S>` with
   >   `declare readonly` data-field members (including
   >   `declare readonly [NODE]: true`) — `declare` because the
   >   constructor's `Object.assign(this, node)` supplies values at
   >   runtime.
   > - **The pack's public entry exports `ComputeService`** so consumer
   >   declaration emit prints the type by reference.
   >
   > Also surfaced by the refactor: `s3-store.ts` spread `{ ...node,
   > type: 's3-store' }`, which with a class silently drops prototype
   > methods; it now reconstructs a proper instance. Verification widened:
   > `pnpm turbo run build` across all packages must pass.

   - The constructor takes the node built by `service()` and does
     `Object.assign(this, node)`.
   - `run`/`load`/`config`/`secrets` become methods with bodies **moved
     verbatim** (memo state moves to `#`-private fields per repo style);
     `run()` additionally calls `stashOrigin(address)` immediately after
     `stashProviderParams(…)`.
   - New method:

     ```ts
     origin(): string {
       this.#origin ??= readOrigin();
       return this.#origin;
     }
     ```
   - `compute()` keeps its exact signature and collision checks, declares
     its return type as `ComputeService<D, P, E, S>`, and returns
     `Object.freeze(new ComputeService(node))`.
   - Extend the existing reserved-collision loop with two checks, same
     error style as the current ones: a user param whose
     `name.toUpperCase() === 'ORIGIN'` →
     `compute(): param "<name>" collides with the framework-written origin row — rename the param.`;
     a secret slot likewise (secret pointer rows share the service-own key
     space via `secretKey`). Deps need no check (their rows are
     input-prefixed).
4. **Tests** (bun test, colocated `__tests__` convention):
   - serializer: `stashOrigin` present → address-free row appears;
     absent → no write; `readOrigin` absent → throws the exact message
     above; present → returns the decoded string.
   - compute: `origin()` returns the value when `COMPOSER_ORIGIN` is set
     (JSON-encoded), memoizes (mutate env after first call, value stays);
     param named `origin` and secret slot named `origin` each fail at
     authoring with the pinned messages; existing `run`/`load`/`config`/
     `secrets` behavior covered by the current suite stays green
     unmodified (the class refactor is behavior-neutral — if an existing
     test must change, stop and report).
   - descriptor: wherever `serialize`'s rows are currently asserted, add
     the `COMPOSER_<ADDR>_ORIGIN` row expectation.
   - Local conformance suite green, untouched (no service in it calls
     `origin()`).
5. **Test-supply idiom** (document in the serializer doc comment): a
   harness supplies the origin by setting `COMPOSER_ORIGIN` to the
   JSON-encoded URL — exactly how the streams entrypoint test supplies its
   `COMPOSER_*` rows. `bootstrapService` is not changed in this slice.

### Docs (D3, orchestrator-authored — not the implementer's)

- Compose ADR (next free number): "A compute service's own origin is a
  target-owned property" — decision: pack-resolved from the provisioned
  endpoint, exposed as `ComputeService.origin()`, never a declared param;
  operator-known origins (custom domains) remain ordinary params.
- Narrow ADR-0032's `appOrigin`/`APP_ORIGIN` motivating example
  accordingly.
- Update the gotchas.md PRO-200 entry's workaround section to reference
  the platform fix once merged.

### PR-review amendments (2026-07-22, Will's review on composer#147 — binding)

1. **Core exports `NODE` as a type only.** `export type { NODE }`; the
   const stays module-private (verified: `import type` works in the class's
   `declare readonly [NODE]: true` and downstream `.d.ts` emit names it).
   Drop the `as never` cast if inference (`const NODE = Symbol.for(…)`)
   satisfies the build; keep annotation+cast only if `isolatedDeclarations`
   forces it. The export comment explains type-only: the value is already
   globally reachable via `Symbol.for`, so a value export adds nothing.
2. **Origin rides the reserved-provider-param machinery via a subclassed
   entry — no bespoke functions.**
   - New runtime-safe brand module (beside `service-keys.ts`):
     `SELF_ORIGIN` brand (`Symbol.for`) + `ORIGIN_PARAM: ProviderParamEntry
     = { name: 'ORIGIN', schema: type('string'), brand: SELF_ORIGIN }`.
   - `ORIGIN_PARAM` joins `RESERVED_PROVIDER_PARAMS`; **`stashOrigin` is
     deleted** — the existing `stashProviderParams` loop stashes it.
   - Deploy side: `descriptors/shared.ts` gains a service-derived sibling
     of `ProviderParam` (same entry base; `valueForService(provisioned,
     address)` instead of `value(refs)`); the registry map's value type is
     the union. `control.ts` registers origin's value function (mirroring
     `rpcAcceptedKeysValue`), which carries the endpointDomain-undefined
     guard with the pinned error message.
   - The descriptor's hand-written origin row push is deleted; the generic
     provider-param loop writes it. Service-derived entries are written for
     **every** compute service (bypassing the `expose` guard, which remains
     for edge-derived entries); edge-ref collection stays exposing-only.
   - `readOrigin` stays (generic `coerce` + the pinned absence error);
     `ORIGIN_KEY_NAME` stays; `run()` no longer calls `stashOrigin`.
   - Tests: descriptor test now also asserts the origin row for a
     **non-exposing** service; `stashOrigin`-specific tests replaced by the
     entry riding the provider-param stash tests; `invariants.test.ts`
     serializer env-token count drops accordingly.

## Open questions

None. Former question (origin supply outside deploy) settled: the
framework supplies the value in every environment; see § Chosen design
"Supply model".

## References

- Draft finding (superseded): `wip/slices/self-origin/spec.md` in the
  `prisma-compose-demo-app-07178e` worktree.
- PRO-200 — create returns a placeholder-region `serviceEndpointDomain`
  (gotchas.md entry; root cause found this session:
  `SERVICE_ENDPOINT_REGION = 'cdg'`).
- Ignite ADR-0008 — endpoint prefix design
  (`ignite/docs/metal/technology/adrs/0008-compute-endpoint-prefix-design.md`).
- `pdp-control-plane/packages/foundry-client/src/regions.ts` —
  `FOUNDRY_REGION_SITES`.
- `pdp-control-plane/services/management-api/models/v1/compute.ts` +
  `pdp-control-plane/packages/interactors/src/compute/domains.ts` — the two
  fallback copies.
- `pdp-control-plane/packages/interactors/src/compute/service.ts` — promote
  persists Foundry's `upsertEndpoint` domain (why post-promote is correct
  today).
- compose: `descriptors/compute.ts`, `serializer.ts`
  (`stashProviderParams`, `encode`), `lowering/src/compute/ComputeService.ts`,
  `lowering/src/compute/Deployment.ts` (env-freeze comment).
- ADR-0031 (reserved provider params — the channel being reused), ADR-0032
  (`envParam` — example to narrow), ADR-0019 (target owns serialization).
