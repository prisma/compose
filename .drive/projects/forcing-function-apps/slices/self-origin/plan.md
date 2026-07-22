# Dispatch plan: self-origin

Three dispatches. D1 and D2 are parallel (different repos, no shared code);
D3 joins them and is blocked on D1 being **deployed to production**, not just
merged. Contract source: [spec.md](spec.md).

## D1 — pdp-control-plane: region-aware fallback endpoint domain

**Outcome:** the Management API composes the pre-promote fallback endpoint
domain from the service's region via `FOUNDRY_REGION_SITES` instead of
hardcoded `cdg`, at both copies
(`services/management-api/models/v1/compute.ts` `fallbackEndpointDomain` and
the private copy in `packages/interactors/src/compute/domains.ts`), with
tests, on a PR that references PRO-200 and states the new contract: the
create response's endpoint domain is the domain the service will serve on.

**Builds on:** nothing (fresh branch off pdp-control-plane main).
**Hands to:** a merged platform PR; D3 waits for its production deploy.

**Completed when:** every item in spec § Implementation contract →
"pdp-control-plane (D1)" is satisfied as written (exact signature, both
copies, comment update, the four test cases, PR contract statement);
`pnpm format` + `pnpm check:types` green from the repo root; PR open.

The contract is binding: no copies of `FOUNDRY_REGION_SITES` (export the
existing map), no new helpers, no deviation without reporting back.

## D2 — compose pack: provision→serialize origin row + boot accessor

**Outcome:** on a fresh compose branch, the prisma-cloud pack writes one
reserved `COMPOSER_<addr>_…` row per compute service carrying the
provisioned `endpointDomain` Output, and the boot side validates, stashes,
and exposes it as the service's origin property — all local verification
green.

**Builds on:** the spec's chosen design; the reserved provider-param channel
(`serializer.ts` `stashProviderParams`, the Output-mapped `encode` in
`descriptors/compute.ts`'s provider loop) as the template.
**Hands to:** a locally-proven branch; D3 adds the live proof and PR.

**Completed when:** every item in spec § Implementation contract →
"compose (D2)" is satisfied as written — `ORIGIN_KEY_NAME` +
`stashOrigin`/`readOrigin` in serializer.ts with the pinned error message;
the unconditional Output-mapped row in the descriptor at the pinned
position; the `ComputeService` class (declaration-merging pattern, bodies
moved verbatim, `origin()` memoized, the two new collision checks with
pinned messages); the full test list — plus local conformance + repo
lint/typecheck/depcruise/casts green; committed with DCO dual sign-off.
Deviations (including any forced core touch or existing-test change) stop
the dispatch and come back for discussion.

## D3 — Live proof, docs, PR

**Outcome:** a fresh service's first deploy on real Prisma Cloud boots
reading its own origin, a request to that exact URL succeeds, the deployment
is destroyed with counts recorded; compose ADR + ADR-0032 example narrowed
(orchestrator-authored docs land on the branch); PR open telling the
FRICTION #9 → property story.

**Builds on:** D2's branch; D1 deployed to production `api.prisma.io`
(verify by creating a throwaway service and checking the create response's
domain region before burning the full proof).
**Hands to:** review URL; slice enters review. S7 (open-chat port) unblocks
on merge.

**Completed when:** live proof recorded (fresh service, first deploy, origin
== serving URL, destroy); docs on the branch; PR open, no auto-merge armed.
