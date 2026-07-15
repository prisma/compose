# Dispatch plan: streams-minted-key

Two dispatches, sequential. Contract source: [spec.md](spec.md).

## D1 — The key moves to the binding rail (framework + module + tests)

**Outcome:** on a fresh branch off origin/main, the streams binding is
`{ url, apiKey }` end to end locally: minted-credential resource + `streams`
descriptor in `@internal/prisma-cloud`, module/service/entrypoint rewired
(no secret slot anywhere in the package), contract + tests + example root
updated, everything green (package tests incl. the entrypoint integration
test, local conformance, repo lint/typecheck/depcruise/casts).

**Builds on:** merged streams-composed-module (main) + the templates named in
the spec.
**Hands to:** a locally-proven branch ready for the live re-proof.

**Completed when:** `bun test src` green with the integration test driving
`COMPOSER_CREDENTIALS_APIKEY`; `pnpm test:conformance:local` 239/239; grep
shows no `secret(` in packages/1-prisma-cloud/2-shared-modules/streams;
repo checks green; committed (DCO dual sign-off).

## D2 — Live re-proof + docs + PR

**Outcome:** the re-shaped module proven on real Prisma Cloud (deploy,
deployed conformance green modulo PRO-218 SSE failures, smoke: 401 unauth /
authed append + read from offset + long-poll — harness key read from deploy
state), deployment destroyed, README + SCOPE updated, PR open with the
ADR-0030 alignment narrative.

**Builds on:** D1's branch.
**Hands to:** review URL; slice enters review.

**Completed when:** deploy + proofs + destroy recorded with counts; docs
updated; PR open (no auto-merge armed).
