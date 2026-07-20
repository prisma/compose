# Dispatch plan: rpc-cold-start

Contract source: [spec.md](spec.md). Branch:
`claude/streams-cold-start-rpc-37e5c1` off merged main (`2bafbbf`). Three
dispatches, sequential; reviewer round after D1+D2 together, then D3.
Orchestrator owns all docs (`gotchas.md`, `.drive/`, `docs/`) — implementers
report staleness, never edit. Evidence rules from the streams slice apply
verbatim: raw program output only; any number an implementer reports is
checked against the code's real format strings before it is believed.

## D1 — the flag and the client retry (rpc package)

**Outcome:** `rpc({ input, output, idempotent: true })` carried on
`__cmp[method]`; `makeClient` applies the bounded idempotent-retry policy
(streams numbers: 250 ms / ×2 / 5 s cap / 5 attempts / jitter; retry thrown
network errors + 5xx + 429, never other 4xx) to marked methods only;
unmarked methods byte-identical to today. Comments state the generic
idempotence semantics, with PRO-217/PRO-219 + the canary named as the
motivating urgency. No prisma-cloud imports.

**Completed when:** the spec's wire-counted tests are green with teeth
confirmed red-by-mutation (retry deleted → marked-method test fails;
retry widened to unmarked → one-request test fails; 4xx retried → 404 test
fails); `test-d` pins the signature; rpc + dependent packages green; repo
checks green; committed with DCO dual sign-off.

## D2 — the canary (scripts + CI) and the example flags

**Outcome:** `scripts/rpc-cold-start-canary.ts` + `-classify.ts` + tests,
cloned from the cold-start canary's proven contract (spaced ≥60 s samples
including before #0, promote-race trigger, log-confirmed coldness with the
2 s margin, 14-hold bug-gone budget, first-close early exit, `MAX_RUN_MS`,
requirable exits); job in `e2e-deploy.yml` over `examples/storefront-auth`,
probing an unmarked method; `examples/store` catalog reads gain
`idempotent: true`, writes stay unmarked. Live rounds during development
must reproduce or honestly fail to reproduce the close, raw output only.

**Completed when:** classify tests green with confirmed teeth;
`test:scripts` green; a live canary run reports `bug-present` (or the
implementer stops and reports why not — a clean run today means a broken
canary, not a fixed platform); workspace left clean with counts; committed.

## D3 — review round, live re-proof, docs, PR

**Outcome:** hostile reviewer pass over D1+D2 (priorities: the retry can
never touch an unmarked method; the canary cannot be masked by the
compensation; the numbers in every report are real); findings closed; a
full live round (deploy storefront-auth, canary verify, destroy); gotchas'
PRO-217 entry gains the RPC face and removal guard (orchestrator writes
it); PR opened against main with the slice narrative, review requested from
Will. No auto-merge armed; merge only on his word.
