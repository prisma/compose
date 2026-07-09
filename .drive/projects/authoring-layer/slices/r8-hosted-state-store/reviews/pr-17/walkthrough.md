# Walkthrough — PR #17: Prisma-hosted Alchemy state store (R8)

Tour of `claude/makerkit-authoring-onboarding-9404cc` vs `origin/main`
(merge-base `a370334`), ~2100 lines across 27 files. This is the walkthrough
pass (tech-lead lens): a narrative of what changed and why, for an operator
deciding whether to merge, comment, or plan follow-ups. Substantive verdicts
live in the two sibling passes — referenced here at altitude, not re-argued:

- Architect (system design): **ship** — [`system-design-review.md`](system-design-review.md)
- Principal engineer (code): **ship with follow-ups** — [`code-review.md`](code-review.md)

## Before / After (intention in code)

```ts
// BEFORE — Alchemy's state store is local files on the deploy machine.
// deploy.ts / lower(): the only fallback is local state.
Alchemy.Stack(opts.name, { providers: target.providers(), state: opts.state ?? localState() }, …)
```

```ts
// AFTER — a target can carry a hosted default; prisma-cloud supplies one.
// deploy.ts
export function resolveStateLayer(opts: LowerOptions, target: Target): AlchemyStateLayer {
  return opts.state ?? target.state?.() ?? localState();
}
Alchemy.Stack(opts.name, { providers: target.providers(), state: resolveStateLayer(opts, target) }, …)

// prisma-cloud/target.ts
state: () => prismaState({ workspaceId: o.workspaceId }),
```

## Sources

- PR: [#17](https://github.com/prisma/makerkit/pull/17)
- Intent: [`spec.md`](../../spec.md), [`design-note.md`](../../design-note.md) (D1–D8),
  [`plan.md`](../../plan.md) (D4 = live proof, D5 = prior review round)
- Commit range: `origin/main...HEAD` (21 commits)

## Intent

Move deploy state off the local `.alchemy/` directory and into a
workspace-scoped Prisma Postgres store, so any machine holding
`PRISMA_SERVICE_TOKEN` plus the workspace id deploys the *same* stack without
duplicating it — and so two concurrent deploys of one stack/stage collide
loudly instead of racing. This is the client-side interim of Step 1 on
`layering.md`'s provisioning-state spectrum; the final platform-side form (the
Management API implementing Alchemy's HTTP `StateApi` v5) is filed as a
platform ask, not built here.

The whole design turns on one modelling decision: the hosted store is *one more
Alchemy state Layer*, indistinguishable at the seam from `localState()`. Core
learns the generic fact "a target may carry a default state layer" and nothing
about Prisma. The architect pass calls this the load-bearing typology call and
finds it held cleanly ([`system-design-review.md`](system-design-review.md),
"What concept is added").

## Change map

- **The store** (Alchemy's 12-method `StateService` over postgres.js):
  [service.ts (L60–L179)](../../../../../../packages/prisma-alchemy/src/state/service.ts:60-179),
  [schema.ts (L12–L38)](../../../../../../packages/prisma-alchemy/src/state/schema.ts:12-38)
- **Automatic bootstrap** (find-or-create project → default DB → fresh connection):
  [bootstrap.ts (L77–L189)](../../../../../../packages/prisma-alchemy/src/state/bootstrap.ts:77-189)
- **The lock** (session advisory lock + `checkLive`):
  [lock.ts (L43–L126)](../../../../../../packages/prisma-alchemy/src/state/lock.ts:43-126),
  guard wrapper [service.ts (L190–L207)](../../../../../../packages/prisma-alchemy/src/state/service.ts:190-207)
- **Layer assembly** (wires all four together, scoped once per run):
  [layer.ts (L30–L62)](../../../../../../packages/prisma-alchemy/src/state/layer.ts:30-62)
- **The core seam** (`Target.state`, `resolveStateLayer`, `AlchemyStateLayer`):
  [deploy.ts (L21–L22, L40–L42, L225–L234, L356)](../../../../../../packages/makerkit-core/src/deploy.ts:225-234)
- **Hosted-by-default for prisma-cloud**:
  [target.ts (L32–L37)](../../../../../../packages/makerkit-prisma-cloud/src/target.ts:32-37)
- **Supporting**: [turbo.json (L3)](../../../../../../turbo.json:3),
  [layering.md](../../../../../../docs/design/03-domain-model/layering.md),
  [core-model.md](../../../../../../docs/design/10-domains/core-model.md)

- **Tests (evidence)**:
  - Store round-trip, marker fidelity, `deleteStack`, migration idempotence — [state.test.ts (222 lines)](../../../../../../packages/prisma-alchemy/src/state/__tests__/state.test.ts)
  - Lock acquire / contend / release / crash-release / FT-5219 server-kill — [lock.test.ts (147 lines)](../../../../../../packages/prisma-alchemy/src/state/__tests__/lock.test.ts)
  - Guard pass-through vs fail-block — [service.test.ts (101 lines)](../../../../../../packages/prisma-alchemy/src/state/__tests__/service.test.ts)
  - Bootstrap find/create/adopt-on-race with stubbed client — [bootstrap.test.ts (202 lines)](../../../../../../packages/prisma-alchemy/src/state/__tests__/bootstrap.test.ts)
  - Layer construction is inert — [layer.test.ts (13 lines)](../../../../../../packages/prisma-alchemy/src/state/__tests__/layer.test.ts)
  - Core precedence `opts > target > localState` — [lowering.test.ts](../../../../../../packages/makerkit-core/src/__tests__/lowering.test.ts)
  - Pack seam, network-free — [state-seam.test.ts (21 lines)](../../../../../../packages/makerkit-prisma-cloud/src/__tests__/state-seam.test.ts)
  - Ephemeral-Postgres harness (how the real-DB suites get a server) — [harness.ts (49–102)](../../../../../../packages/prisma-alchemy/src/state/__tests__/harness.ts:49-102)

## The story

1. **Build the store.** Implement Alchemy's `StateService` — its 12
   Effect-based methods — directly over postgres.js against two tables:
   `alchemy_resource_state` keyed `(stack, stage, fqn)` and
   `alchemy_stack_output` keyed `(stack, stage)`. The methods map 1:1 onto
   trivial SQL. The one subtlety worth knowing: values go through Alchemy's own
   `encodeState` / `reviveStateRecursive`, so `Redacted` / `Duration` markers
   round-trip byte-identically to every other Alchemy store — and writes must
   use `sql.json(...)` (not a `::jsonb` cast on a pre-stringified string), or
   postgres.js double-encodes the value. Both traps are named at the code site.

2. **Bootstrap the backing database automatically, with zero user steps.** On
   Layer init the store uses the Management API (authenticated by the service
   token the deployer already has) to find-or-create a reserved
   `makerkit-state` project, take its *default* database (never creating one —
   FT-5220 says a second default 409s), and mint a *fresh* connection per run,
   reading `endpoints.direct.connectionString` (PRO-212). Minting fresh every
   run is the point: the DSN is write-only on read, so nothing is ever stored
   or shared between machines — **possession of the service token is the entire
   credential**, which is what makes a second machine's bootstrap need nothing
   it didn't already have. A dedicated project (not a resource inside the app's
   own project) because the app's project is circular: it doesn't exist before
   the first apply and is itself tracked in the state it would have to host
   (design-note D3).

3. **Take a lock that a crash releases for free.** On a *reserved* connection,
   `pg_try_advisory_lock` on a hash of `makerkit:<stack>/<stage>`. Session
   scope, not transaction scope — a transaction lock releases at the first
   commit and a deploy spans many. The lock is held for the whole run and, if
   the deployer process dies, Postgres auto-releases it when the connection
   drops: lease semantics with no lease bookkeeping. Contention fails
   *immediately* with a `StateLockContentionError` naming the stack and stage,
   never queues.

   The review-round twist worth narrating (commit `9d7392c`): the lease has to
   be re-verified before each storage op (an idle-closed connection could
   silently drop it — FT-5219 class). The obvious way — query the reserved
   connection itself — was probed for real and found to *crash the deploy
   process*: after a server-side kill, postgres.js doesn't reconnect a reserved
   connection and doesn't cleanly reject either; it throws deep in its deferred
   write path, outside the promise chain. So `checkLive` was rebuilt to capture
   the lock backend's pid at acquire time and ask a *separate pool connection*
   whether that pid still holds the advisory lock in `pg_locks` — the same
   answer, without ever touching the connection that might be dead
   ([lock.ts (L74–L111)](../../../../../../packages/prisma-alchemy/src/state/lock.ts:74-111)).
   The principal-engineer pass verified the 64-bit key decomposition in that
   query is bit-exact ([`code-review.md`](code-review.md), "What looks solid").

4. **Add the seam and make it the default.** Core's `Target` gains an optional
   `state?: () => AlchemyStateLayer`; `lower()` resolves
   `opts.state ?? target.state?.() ?? localState()` through a pure, testable
   `resolveStateLayer`. `prismaCloud()` supplies the hosted store as its
   default. Explicit `opts.state` still pins local state deliberately (CI's
   ephemeral runs, for example). Core stays target-neutral: the field is
   generic, only the pack names Prisma. This is design-note D5 option (b),
   chosen over "callers pass it every time" precisely because forgetting would
   silently revert to local state — the duplicate-stack footgun this whole
   slice exists to kill.

5. **Prove it live.** The headline result (plan.md D4, real Prisma Cloud):
   deploy from workdir A, then delete all local `.alchemy/` state and redeploy
   the same stack from a fresh workdir → `Plan: 1 to update, 12 to noop`, zero
   duplicate projects. That single no-op redeploy is the exact failure hosted
   state exists to prevent. (The one update is known Next `BUILD_ID`
   non-determinism, not a state defect.) Also demonstrated: round trip live
   (`Auth /verify says: true`), lock contention fails fast, `kill -9` then
   redeploy re-acquires, and destroy leaves `makerkit-state` standing.

6. **Supporting changes.** `turbo.json` passes `TMPDIR` through strict env, so
   `os.tmpdir()` stops falling back to `/tmp` and breaking the store tests on
   multi-account machines. `layering.md` marks Step 1 shipped-interim;
   `core-model.md` amends the `Target` / `LowerOptions` sketch to match the new
   precedence.

## Behavior changes & evidence

- **Deploy state is workspace-hosted, not local files** — untracked
  `.alchemy/` on one machine → a shared Postgres store any token-holder reads.
  - **Why**: kill the duplicate-stack footgun; enable multi-machine and CI
    deploys of one stack without coordination.
  - **Implementation**: [service.ts (L60–L179)](../../../../../../packages/prisma-alchemy/src/state/service.ts:60-179),
    [layer.ts (L30–L62)](../../../../../../packages/prisma-alchemy/src/state/layer.ts:30-62)
  - **Tests**: [state.test.ts](../../../../../../packages/prisma-alchemy/src/state/__tests__/state.test.ts)
    (all 12 methods round-trip; `Redacted`/`Duration` fidelity against real Postgres)

- **Bootstrap needs only the service token + workspace id** — manual state
  config → automatic find-or-create, fresh connection per run, nothing stored.
  - **Why**: a second machine deploys with exactly what it already needed;
    no DSN distribution.
  - **Implementation**: [bootstrap.ts (L77–L189)](../../../../../../packages/prisma-alchemy/src/state/bootstrap.ts:77-189)
  - **Tests**: [bootstrap.test.ts](../../../../../../packages/prisma-alchemy/src/state/__tests__/bootstrap.test.ts)
    (find / create / adopt-on-race / real-failure / no-default-DB, stubbed client)

- **Concurrent deploys of one stack/stage collide loudly** — silent race →
  immediate `StateLockContentionError`; crash auto-releases.
  - **Why**: two deploys mutating one state at once corrupts it; a crashed
    deployer must not wedge the lock.
  - **Implementation**: [lock.ts (L43–L126)](../../../../../../packages/prisma-alchemy/src/state/lock.ts:43-126)
  - **Tests**: [lock.test.ts](../../../../../../packages/prisma-alchemy/src/state/__tests__/lock.test.ts)
    (contention / release / crash-release / lease-loss / FT-5219 real `pg_terminate_backend`)

- **A lost lease refuses to run unlocked** — `checkLive` fires before every
  guarded storage op; failure aborts rather than proceeding.
  - **Why**: an idle-closed connection could drop the lock mid-deploy.
  - **Implementation**: [service.ts (L190–L207)](../../../../../../packages/prisma-alchemy/src/state/service.ts:190-207)
    (`getVersion` excluded — pure constant)
  - **Tests**: [service.test.ts](../../../../../../packages/prisma-alchemy/src/state/__tests__/service.test.ts)

- **`prismaCloud()` deploys are hosted by default; core stays Prisma-agnostic**
  — `opts.state ?? localState()` → `opts.state ?? target.state?.() ?? localState()`.
  - **Why**: make the smooth onramp the default without per-app wiring, without
    core depending on any `prisma-*` package.
  - **Implementation**: [deploy.ts (L225–L234)](../../../../../../packages/makerkit-core/src/deploy.ts:225-234),
    [target.ts (L32–L37)](../../../../../../packages/makerkit-prisma-cloud/src/target.ts:32-37)
  - **Tests**: [lowering.test.ts](../../../../../../packages/makerkit-core/src/__tests__/lowering.test.ts)
    (precedence by identity, no Alchemy boot),
    [state-seam.test.ts](../../../../../../packages/makerkit-prisma-cloud/src/__tests__/state-seam.test.ts)
    (real `prismaState` import; construction inert)

## Cross-lens tension to weigh before merging

The two substantive passes agree the mechanism is correct and both say ship.
They read the **test suite** differently, and that disagreement is the one
thing an operator should decide on rather than skim past:

- The architect pass calls the test partitioning **architecturally sound** —
  each conceptual boundary has its own partition, and the store's SQL is proven
  against real Postgres ([`system-design-review.md`](system-design-review.md),
  "Test strategy").
- The principal-engineer pass agrees the *assertions* are correct but flags
  (F01) that the real-Postgres suites — `state.test.ts` and the entire
  `lock.test.ts` — **silently skip on the CI runner**: the harness never probes
  Ubuntu's Postgres path and CI sets no service, so `pnpm test` passes green
  without ever exercising the code this slice ships
  ([`code-review.md`](code-review.md), F01).

These aren't contradictory verdicts — one lens judges the *shape* of the tests,
the other judges *whether they run where it matters*. Both can be true at once.
What the operator decides: whether the green test gate is trustworthy enough to
merge on, or whether F01 (wire a Postgres into CI, and make the skip loud when
`CI` is set) is a merge-blocker rather than a follow-up. The principal-engineer
pass names F01 + F02 as the two things to close before *relying on this in CI*.

## Compatibility / migration / risk

- **Behavioral default flip.** After this PR, any `prismaCloud()` deploy that
  passes no `opts.state` resolves to hosted state. Existing deploys carrying a
  standing local `.alchemy/` should be migrated once (design-note D8:
  `syncState`, script-level; no product surface here). This is a PoC — the
  standing demo was destroyed and redeployed once onto hosted state, not
  migrated in place.
- **Rollback is one unit.** Revert the PR and the `localState()` default
  returns; the seam is additive and optional.
- **Stale CI-workflow comments (F02).** `e2e-deploy.yml` was not touched (slice
  boundary) but its Destroy guard and comments still describe the local-state
  world; principal-engineer flags this as a follow-up that could mask orphaned
  hosted state. See [`code-review.md`](code-review.md) F02.

## Follow-ups / open questions (from the sibling passes — not adjudicated here)

- **F01** wire real Postgres into CI + make the skip loud — the one that
  decides whether the test gate means anything ([`code-review.md`](code-review.md)).
- **F02** un-stale `e2e-deploy.yml`'s Destroy guard/comments after the default flip.
- **F03/F07** first-deploy default-DB-visibility assumption; per-run connection
  accumulation in the shared `makerkit-state` DB (rate raised now that CI is
  hosted-by-default).
- **Accepted residuals** (spec + design note): first-ever-deploy find-or-create
  split-brain window; one inert `alchemy_stack_output` row surviving destroy
  (stock Alchemy behavior — its destroy path never calls `deleteStack`).
- **Doc drift** (architect): design-note D4 still frames the lock around the
  reserved connection; `checkLive`'s rebuilt pool-connection mechanism lives
  only in plan.md D5 and the lock.ts comment. One-line amendment
  ([`system-design-review.md`](system-design-review.md), "Design-doc integrity").
- **Ubiquitous-language** (architect): "control plane" is a homonym across
  `core-model.md` (build-time plane) and `layering.md` (infrastructure sense) —
  pre-existing, reinforced here. Team-level, not this slice's to resolve.

## Non-goals / intentionally out of scope

- The platform-side Management API `StateApi` v5 implementation (filed as
  `platform-ask.md`; the client side already exists).
- Secrets-in-state encryption — stored as plaintext JSONB by explicit decision
  (design-note D6); the DB is service-token-gated and encrypted at rest.
- Any CLI surface (`makerkit state sync`) — owned by the parallel CLI track.
