# Slice: RPC cold-start handling — contract-declared idempotence, with its own canary

## At a glance

`rpc()`'s `makeClient` carries no cold-start handling: every service-to-service
RPC edge hits PRO-217's intermittent socket close raw on a cold target — and
PRO-217 is **live**, reproduced repeatedly during the streams slice
(2026-07-17: multiple `502 … socket connection was closed` on log-confirmed
cold starts). Unlike streams, every RPC call is a POST with no
transport-level idempotency signal, so a blanket retry in `makeClient` would
be exactly the double-execution hazard the streams append work fenced off.

The safe shape, settled with Will (2026-07-17): **a method opts in at its
definition** — `rpc({ input, output, idempotent: true })` — and `makeClient`
applies a bounded cold-start backoff to marked methods only. Everything else
keeps today's fail-fast behavior with the failure surfaced. Own canary,
cloned from the (now trustworthy) cold-start canary's contract.

## The design

### The flag

- `rpc({ input, output, idempotent: true })` — optional, default absent
  (= not idempotent, never retried). The flag rides on the method's runtime
  value in `__cmp[method]` beside the two schemas, exactly where `makeClient`
  already reads them.
- Declaring it is the METHOD AUTHOR's claim ("calling this twice is the same
  as calling it once"), stated where the method is defined — the one place
  that claim can be reviewed. Nothing infers it; nothing upgrades it.

### The retry (client-side only; serve() unchanged)

- `makeClient` wraps marked methods in a bounded backoff mirroring the
  streams client's policy and numbers (250 ms initial, ×2, 5 s cap, 5
  attempts, jittered): retry thrown network errors, 5xx, and 429; never any
  other 4xx (a real protocol answer surfaces on the first try). Unmarked
  methods get today's single attempt, byte-for-byte.
- **Layering note, resolved:** rpc is framework-layer (target-agnostic), so
  the policy is stated as generic idempotent-retry semantics — correct on
  any transport for any method whose author declares idempotence — with the
  comment naming PRO-217/PRO-219 as the motivating platform behavior and the
  new canary as the removal trigger for the *urgency*, not the mechanism.
  No prisma-cloud import enters the rpc package.

### The canary (PRO-217, RPC face)

A sibling of `scripts/cold-start-canary.ts`, inheriting every hard-won rule
of its 2026-07-17 rebuild — these are requirements, not suggestions:

- **Trigger:** fresh deployment of the target service via create → upload →
  start → race the promote call (never wait for `running`); first-touch RPC
  call through the consumer the instant promote succeeds.
- **Cadence:** ≥60 s between samples, including before sample #0 —
  back-to-back promotions produce ~1 s boots the bug does not live in.
- **Coldness is proven, not inferred:** the touch counts only if the
  deployment's own boot log shows it was sent before the server's listening
  line, outside the 2 s cross-clock margin; no latency guessing.
- **Statistical bug-gone rule:** `bug-gone` requires 14 confirmed cold-start
  holds (20% target close rate, ≤5% false-clean chance); any close is
  decisive `bug-present`; anything else inconclusive → warning, exit 0.
- **Probe an UNMARKED method**, so the raw platform behavior stays
  observable — the compensation must not be able to mask the canary.
- Requirable exits: bug present → 0 (green), conclusively gone → 1 (red,
  message names what to delete: the retry policy's cold-start framing, this
  canary, the gotchas paragraph), inconclusive → 0 + `::warning::`.
- Rides `examples/storefront-auth` (the minimal storefront → auth RPC edge)
  through the existing deploy-verify-destroy action; own `-classify.ts`
  module with unit tests, own job in `e2e-deploy.yml`, NOT in the required
  set until Will adds it.

### The example

`examples/store`'s catalog contract gets the flag where it is true —
`listProducts`, `getProduct`, `getSpecial` are idempotent reads;
`rotateSpecial` and `placeOrder` stay unmarked — so the example documents
the judgment call the flag exists to force.

## Verification bar

- **Wire-counted, mutation-verified tests** in the rpc package (the streams
  append-test pattern): a marked method against a transport that 503s then
  succeeds → resolves, with the retry counted at the stub transport; an
  UNMARKED method against the same transport → rejects after exactly ONE
  request, re-asserted after a settle window; a marked method against a 404
  → rejects after exactly one request (4xx never retried). Each verified red
  by deleting the behavior it pins.
- Type-level: the flag is optional and absent-by-default; `test-d` pins that
  marking a method does not change its call signature.
- Canary classify tests extended from the cold-start suite's shapes,
  including the never-went-cold and sample-budget rules; teeth confirmed.
- Live round: the canary run against a fresh deploy, raw output only —
  expected verdict today is `bug-present` (the bug is live). A `bug-gone`
  from a run today means the canary is broken; investigate, do not report
  it as a result.
- Repo checks green: typecheck, lint, casts delta 0, depcruise,
  `test:scripts`.

## Out of scope

- Retrying non-idempotent calls under any policy. Not negotiable — the
  no-double-execution reasoning is recorded in the streams design docs.
- Server-side (serve()) changes; the retry is a client concern.
- Adding the canary to the required-checks list (Will's manual step).
- Typed `streamDef({ event })` and the streams follow-ups — separate slice.
