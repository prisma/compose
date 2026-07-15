# Slice: Streams bearer key becomes a minted binding credential

## At a glance

Re-shape the streams module's consumer auth onto the ADR-0030 pattern: the
bearer key is **minted at deploy** and delivered **through the binding**, not
root-bound as an ADR-0029 secret. The binding becomes `{ url, apiKey }`; the
module's `apiKey` secret slot and the consumer-side "bind the same platform
variable twice" convention disappear. Settled in the 2026-07-15 design session
(see design-notes.md § "Streams consumer auth — settled by ADR-0030");
predecessor slice: streams-composed-module (merged, PR #84).

## Chosen design

Mirror storage's minted-credential machinery end to end (`s3Credentials` +
`s3StoreDescriptor` are the templates):

- **Contract** (`@internal/streams/contract.ts`): `StreamsConfig` gains
  `readonly apiKey: string`; `durableStreams()` connection params become
  `{ url, apiKey }`; `__cmp` updated. README example's consumer fetch snippet
  switches from `service.secrets()` to the binding.
- **Minted resource** (`@internal/prisma-cloud`, mirror
  `s3-credentials-resource.ts`/`s3-credentials.ts`): a bearer-key credential
  — random 48-hex, minted once at deploy, stable in deploy state — kind
  distinct from slice 2's planned per-edge `ServiceKey` (that name is
  reserved by the rpc-service-key project). Provides `{ apiKey }`. Server
  minimum is 10 chars; 48 hex clears it.
- **Descriptor** (`target/descriptors`, mirror `s3-store.ts`): a `streams`
  node kind = compute's descriptor with extended outputs — `apiKey` surfaced
  from the wired credentials resource in `serialize`/`deploy` outputs, so a
  consumer's `durableStreams()` binding resolves both fields by name.
  `streamsService()` routes to it the way `s3StoreService` routes to
  `s3-store` (type override on `compute()`).
- **Module** (`streams-module.ts`): drops the `apiKey` secret slot from its
  boundary; provisions the credentials resource internally (as storage owns
  `credentials`); boundary keeps `store: s3()`. Service deps become
  `{ store, credentials }`, secrets: none.
- **Entrypoint**: `API_KEY` comes from `load().credentials.apiKey` instead of
  `secrets()`.
- **Single key per module instance** — the upstream server's auth is one
  `API_KEY`. Distinct per-edge keys (full ADR-0030 slice-2 alignment) need an
  upstream accepted-key-set change; recorded as future work, out of scope.

## Coherence rationale

One auth model swapped whole: contract, mint, descriptor, module wiring,
entrypoint, docs, and the live re-proof must move together — a partial land
would ship a binding whose `apiKey` never resolves or a server whose key
nobody holds. One reviewer holds "did the key move from secret slot to
binding rail correctly?" in one sitting; rolls back as one unit.

## Scope

**In:** contract change; the minted-key resource + `streams` descriptor in
`@internal/prisma-cloud`; module/service/entrypoint rewiring; tests
(module graph, integration, type tests) updated; `examples/streams` root
drops `envSecret` (fresh branch off main — the repo renamed to Composer);
README + SCOPE.md auth sections; live re-proof (deploy, deployed conformance,
smoke, destroy).

**Deliberately out:**
- Per-edge keys / accepted-key sets (needs upstream server change + #89
  slice 2; recorded in design-notes.md).
- External (out-of-deployment) key access — same recorded platform ask as
  storage's minted credentials. Test harnesses may read the key from deploy
  state; document that as the harness route.
- Touching rpc-service-key's surfaces or claiming the `ServiceKey` name.

## Pre-investigated edge cases

| Case | Handling |
| --- | --- |
| Deployed conformance/smoke harnesses need the minted key externally | Read it from deploy state (it is stable there), as the harness-only route; not a consumer pattern. |
| `configKey` collision: credentials dep param `apiKey` vs old secret slot `APIKEY` | Old slot is deleted in the same change; integration test env moves from `COMPOSER_APIKEY` (secret pointer) to `COMPOSER_CREDENTIALS_APIKEY` (dep param). |
| A stale consumer built against `{ url }`-only binding | Contract `satisfies` compares kind only; the new param resolves by name from producer outputs — old consumers rebuild against the new types on upgrade (pre-1.0, no compat shim). |

## Done conditions (slice-specific)

- Module tests + entrypoint integration test green with the key wired as a
  dep, not a secret; no `secret()` remains in the streams package.
- Live re-proof: deploy `examples/streams`, deployed conformance green
  modulo the known SSE-ingress failures (PRO-218), consumer smoke green
  (401 unauthenticated / authed append + read + long-poll), then destroyed.
- README/SCOPE reflect the minted model and the future per-edge note.

## References

- design-notes.md § Streams consumer auth (the settled decision)
- ADR-0030 (merged, #89); `.drive/projects/rpc-service-key/plan.md` on main
  (slice 2's reserved shape)
- Templates: `s3-credentials-resource.ts`, `s3-credentials.ts`,
  `descriptors/s3-store.ts`, `s3-store.ts` (service factory)
