# Code review — PR #17: Prisma-hosted Alchemy state store (R8)

Persona: principal-engineer. Scope: branch `claude/makerkit-authoring-onboarding-9404cc`
vs `origin/main` (merge-base `a370334`). Evidence: `git diff origin/main...HEAD`,
the slice `spec.md`/`design-note.md`/`plan.md`, and `alchemy@2.0.0-beta.59` source.

## Summary

The store, seam, default, and lock are correctly built and were proven live once
against real Prisma Cloud (plan.md D4). The mechanism is sound; the gaps are in
operability and CI coverage — most importantly the load-bearing store and lock
tests silently skip on the CI runner, so a green `pnpm test` does not exercise the
code this slice ships.

## What looks solid

- **The lock's `checkLive` is correct, including the 64-bit key decomposition.**
  A single-`int8` advisory lock is stored as `classid` = high 32 bits, `objid` =
  low 32 bits, `objsubid = 1` (Postgres `SET_LOCKTAG_INT64`). The reconstruction
  `(classid::bigint << 32) | (objid::bigint & 4294967295) = hashtextextended(key,0)`
  is bit-exact even when the hash is negative (Postgres `int8shl`/`int8or` are raw
  64-bit bit ops, no overflow check), and the `objsubid = 1` filter matches the
  single-argument lock form. Verified against `pg_locks` semantics and empirically
  by `lock.test.ts` (`FT-5219: a server-killed reserved connection…`), which drives
  a real `pg_terminate_backend`. Deliberately never querying the possibly-dead
  reserved connection (which would crash the process in postgres.js's deferred
  write path) is the right call and is documented at the code site.
- **Value fidelity path is right.** Every write (`set`, `setOutput`) goes through
  `jsonParam` → `sql.json(encodeState(...))`; the double-encode footgun is named
  and avoided. `getReplacedResources` filters `value ->> 'status' = 'replaced'` in
  SQL — same semantics as `LocalState` (which lists then filters `status ===
  "replaced"`), minus the N+1. `Redacted`/`Duration` round-trip is asserted against
  a real Postgres.
- **The seam is minimal and target-neutral.** `resolveStateLayer(opts, target)` is
  a pure `opts.state ?? target.state?.() ?? localState()`; precedence is proven by
  identity against sentinels without booting Alchemy. Core gains no prisma
  dependency (the type is generic; only the pack supplies the value).
- **Finalizer ordering is correct.** `sql.end` is registered before the lock, so
  LIFO runs `lock.release()` (returning the reserved connection) before closing the
  pool. On lock contention the lock finalizer is never registered, but the pool
  finalizer still closes the pool — no leaked pool.
- **No-bare-cast compliance.** The three `blindCast<T, "reason">` uses in
  `service.ts` carry real, reviewable justifications; no bare `as` introduced in
  production files.

## Findings

**F01 — `.github/workflows/ci.yml` test job + `packages/prisma-alchemy/src/state/__tests__/harness.ts` (lines 21-57)**
Issue (correctness of the DoD gate): the store round-trip/fidelity tests
(`state.test.ts`) and the entire lock lifecycle suite (`lock.test.ts`) — the
load-bearing coverage for exactly what this slice ships — run only when the harness
finds a Postgres. `harness.ts` resolves it from `STATE_TEST_DATABASE_URL`, then from
`initdb`/`pg_ctl` on PATH or Homebrew paths (`/opt/homebrew`, `/usr/local`). The CI
`test` job runs on `ubuntu-latest`, sets neither env var nor a Postgres service, and
Ubuntu's server binaries live at `/usr/lib/postgresql/<v>/bin` — a path the harness
never probes and which is not on PATH. So on CI `startTestPostgres()` returns
`undefined`, `describe.skipIf` skips both suites, and the run passes green with only
a `console.warn`. "`pnpm test` green" therefore certifies nothing about the store or
the lock. This is the blast-radius probe answered badly: if the store regresses,
nothing in CI notices.
Suggestion: add a Postgres to the CI `test` job — either a `services: postgres:`
container with `STATE_TEST_DATABASE_URL` wired to it, or add Ubuntu's
`/usr/lib/postgresql/*/bin` to the harness's `findBinary` candidates. Separately,
make the skip loud in CI: when `process.env.CI` is set and no Postgres is found,
`throw` instead of returning `undefined`, so the gap fails the build instead of
passing it.

**F02 — `.github/workflows/e2e-deploy.yml` (Destroy step + header comments); `examples/storefront-auth/alchemy.run.ts` (line 23)**
Issue (operability, shared-surface blast radius): this PR flips the default state
backend, so `alchemy.run.ts` — which passes no `opts.state` — now resolves to hosted
state via the `prismaCloud` target default. The e2e workflow was not updated (the
slice boundary forbids touching it) and its comments now describe the old world:
"alchemy state is local to this runner and dies with it," and the Destroy step is
guarded on `[ -d .alchemy ]`. With hosted state there is no local state dir; per
plan.md D4 the alchemy CLI still writes an empty `.alchemy/` *log* dir, which is the
only reason the guard passes and Destroy runs at all. If that incidental log dir ever
stops being created, Destroy is skipped and the run orphans real cloud resources
*and* hosted state rows in the shared `makerkit-state` project — with a comment that
tells the on-call reader there is nothing to clean up. The spec AC "decide and pin
the CI e2e's state explicitly" was decided (keep hosted, plan.md D4) but the decision
is recorded only in a Drive doc, not at the workflow.
Suggestion: add one comment line to `e2e-deploy.yml` stating state is hosted-by-
default (token + workspace id are the backing), and change the Destroy guard so it
does not depend on `.alchemy` existing — attempt destroy whenever the Deploy step
ran. If the boundary means the CLI track must own this edit, file it as an explicit
follow-up rather than leaving the stale comment standing.

**F03 — `packages/prisma-alchemy/src/state/bootstrap.ts` (lines 77-96, 124-140)**
Issue (constraint-vs-assumption, first-run failure mode): on a first-ever deploy
`createStateProject` returns and `findDefaultDatabase` immediately lists databases
expecting the auto-provisioned default to be present. Whether the default database is
listable synchronously in the same tick as the project-create response is an
assumption, not a documented contract — FT-5220 says the default is auto-provisioned
but not *when* it becomes visible. If provisioning is async, the first deploy dies
with `project … has no default database` and the operator must re-run (the second run
takes the find path and succeeds). The live proof hit this path once and it worked —
one data point, not a guarantee.
Suggestion: bound-retry `findDefaultDatabase` (a few polls with backoff) after a
fresh create, or at minimum name the assumption at the code site and make the error
message tell the operator to re-run.

**F04 — `packages/prisma-alchemy/src/state/layer.ts` (lines 30-62); `errors.ts` (lines 4-7)**
Issue (operability + secrets hygiene): any bootstrap/migration/lock failure is
`Layer.orDie`, so the operator sees a raw Effect defect, not a runbook-shaped message.
The DSN is `Redacted` through bootstrap, but the moment `postgres(Redacted.value(
connectionString), …)` is called the plaintext DSN lives inside the postgres.js
client's options. `toStateStoreError` retains the thrown value as `cause`, and a
postgres.js connection error dumped by the defect printer surfaces whatever that
error object carries. postgres.js connection errors generally do not embed the
password, but this has not been confirmed for this driver version, and the failure
path is the one most likely to be pasted into a log or issue.
Suggestion: wrap bootstrap/connect failures in an operator-facing message
("hosted-state bootstrap failed for workspace X: <reason>") and confirm the postgres.js
error object carries no credential before retaining it as `cause`; if unsure, strip
`cause` on the connect path.

**F05 — `packages/prisma-alchemy/src/state/service.ts` (guardStateService, lines 190-207)**
Issue (performance / cheapest-alternative): `checkLive` fires a `pg_locks` `select
exists(...)` before all 11 storage methods, including every read. A deploy issues many
`get`/`set`/`list` calls, so this roughly doubles the round-trips to Prisma Postgres
across a run. Gating reads adds cost without protecting anything mutable, and the
cheaper alternatives (gate only the mutating methods, or check the lease on a time
interval rather than per-op) were not named or rejected in the design note.
Suggestion: either restrict the guard to `set`/`delete`/`deleteStack`/`setOutput`, or
document at `guardStateService` why per-op-including-reads is the deliberate choice
(a lost lease means a concurrent deploy may be mutating, so even reads are
untrustworthy — a defensible reason worth writing down).

**F06 — `packages/prisma-alchemy/src/state/service.ts` (guardStateService) / `lock.ts` (checkLive doc, lines 17-27)**
Issue (maintainability, accepted TOCTOU left implicit): `checkLive` then the wrapped
SQL is not atomic — the lease can be lost in the window between the check passing and
the operation executing. The design accepts this (the real risk is the reserved
connection dropping, and the window is microseconds), but neither doc names the
residual race, so a later reader may mistake `checkLive` for a hard guarantee that the
op ran under the lock.
Suggestion: one sentence at `guardStateService` stating the check is best-effort and
non-atomic with the following operation.

**F07 — `packages/prisma-alchemy/src/state/bootstrap.ts` (mintConnection, lines 150-172)**
Issue (blast radius, rate amplified by this PR): every deploy mints a new connection
(`makerkit-state-${Date.now()}`) and nothing ever deletes it. With hosted state now
the CI default (F02), every push-to-main and dispatch run also mints one, plus leaves
a surviving `alchemy_stack_output` row per unique stack (plan.md D4). The shared
`makerkit-state` database accumulates connection resources without bound; if Prisma
Postgres caps connections per database, this eventually fails *every* deploy in the
workspace — including the standing demo — a slow, shared-surface failure. The design
note defers cleanup to "a follow-up if the API doesn't make listing a one-call
operation," but making hosted state the CI default materially raises the accrual rate.
Suggestion: the cheap mitigation the design note already floats — list and delete aged
`makerkit-state-*` connections at bootstrap init — is worth doing now, or at minimum
capture the connection cap and current accrual rate so the follow-up has a trigger,
not just a note.

## Deferred (out of scope)

| Item | Why out of scope |
| --- | --- |
| `ALCHEMY_PASSWORD` dead plumbing (`scripts/setup-env.ts`, e2e-deploy.yml still generates it) | Design note D6 explicitly routes this to a separate direct change; nothing in alchemy v2 reads it. Not this slice. |
| Secrets in state stored as plaintext JSONB | Design note D6, operator-confirmed deferred item ("provisioned credentials → transient platform secret"). Explicitly no action this slice. |
| Management API `StateApi` v5 server side | Design note D7 / `platform-ask.md` — filed upstream, not built here by design. |
| First-deploy find-or-create split-brain residual (`bootstrap.ts` adopt-on-race) | Named and accepted in spec + design note as the residual every find-or-create carries; the adopt-by-relist mitigation is present and tested. |
| Naming / typology / system-shape of `Target.state`, `prismaState`, `makerkit-state` project | Architect lens (running in parallel), not this pass. |
| `turbo.json` `globalPassThroughEnv: ["TMPDIR"]` scoped globally rather than to the `test` task | Cache correctness is preserved — TMPDIR is inert to build/test *outputs*, so excluding it from the hash cannot produce a stale hit. Style-only; not worth a change. |

## Already addressed

A prior in-branch review round (Opus, plan.md D5) landed three fixes. All verified to
hold on the current tree:

| Fix (commit) | Claim | Verified |
| --- | --- | --- |
| `173beb5` — exclude `getVersion` from the guard | `getVersion` is a compile-time constant; guarding it adds a pointless reserved-connection round-trip | HOLDS. `service.ts:195` calls `service.getVersion()` directly with no `checkLive`. `service.test.ts` "getVersion is excluded from the guard" asserts it returns `5` even when `checkLive` fails. |
| `34b1a52` — unit-test `guardStateService` | Prove fail-path blocks all storage methods, pass-path calls through | HOLDS. `service.test.ts` asserts: on `checkLive` fail every guarded method rejects and the underlying stub is never invoked (`calls === []`); on pass all 10 call through in order; `id` passes through. |
| `9d7392c` — rebuild `checkLive` on pid + `pg_locks` | postgres.js does not reconnect a server-killed reserved connection, and querying it crashes the process; ask a *pool* connection whether the acquire-time pid still holds the lock | HOLDS. `lock.ts:85-111` captures `lockPid` at acquire and queries `pg_locks` via the pool `sql`, never the reserved connection. `lock.test.ts` "FT-5219…" drives a real `pg_terminate_backend`, polls until the lock is gone, then asserts `checkLive` rejects and a second session can acquire. The bit arithmetic in that query is correct (see "What looks solid"). |

## Acceptance-criteria verification

ACs extracted from `spec.md` "Scope In" (SI) and "Slice DoD" / design-note "Proof" (P).

**AC1 (SI) — `@makerkit/prisma-alchemy/state`: `prismaState()` Layer = StateService
impl + idempotent migration + bootstrap (find-or-create → default DB → fresh
connection/run) + advisory-lock acquire/release + loud contention error naming
stack/stage; postgres.js, no Bun coupling.**
Read code: `service.ts` (12 methods 1:1 over the two tables), `schema.ts`
(`create table if not exists`), `bootstrap.ts` (find-or-create, default-DB, mint-per-
run), `lock.ts` (`StateLockContentionError` message names `${stack}/${stage}`),
`layer.ts` (`prismaState`), `index.ts` + `package.json` `"./state"` export. Only
`postgres` imported; no `bun:` API. **PASS.**

**AC2 (SI) — core `Target.state?: () => AlchemyStateLayer`; `lower()` resolves
`opts.state ?? target.state?.() ?? localState()`.**
`deploy.ts:40-42` (optional field), `deploy.ts:231-233` (`resolveStateLayer`),
`deploy.ts:356` (used in `lower`). Test assertions: `lowering.test.ts`
`resolveStateLayer` block proves opts > target > localState by identity. **PASS.**

**AC3 (SI) — `prismaCloud()` supplies `state: () => prismaState({ workspaceId })`.**
`target.ts:36`. `state-seam.test.ts` asserts `target.state` is defined and calling it
yields a Layer without touching the network (construction is inert). **PASS.**

**AC4 (SI) — store unit tests against real Postgres: 12 methods round-trip,
encode/revive fidelity (Redacted marker), lock contention + release, idempotent
migration; core seam test (target default vs opts override).**
Test *assertions* are present and correct: `state.test.ts` covers all 12 methods,
`Redacted` + `Duration` fidelity, `list` excludes outputs, `deleteStack` with/without
stage, migration idempotence; `lock.test.ts` covers contention/release, crash-release,
lease-loss, and the FT-5219 server-kill; `bootstrap.test.ts` covers find/create/adopt-
on-race/real-failure/no-default-DB via a stubbed client; the seam is covered by
`lowering.test.ts` + `state-seam.test.ts`. But the real-Postgres suites skip silently
on CI (F01), so the DoD's "tests pass" does not actually execute them where it
matters. **WEAK** — correct assertions, not run in CI.

**AC5 (P1-P4) — live proof: fresh-workdir redeploy → zero duplicates + round trip
live; lock contention fails fast; crash-release; destroy clean with `makerkit-state`
surviving.**
Manual verification recorded in plan.md D4 against the real workspace: Deploy A `Plan:
13 to create → Done: 26 succeeded`; round trip rendered `Auth /verify says: true`;
fresh-workdir redeploy `Plan: 1 to update, 12 to noop`, same two project ids (zero
duplicates); lock contention raised `StateLockContentionError` naming
`storefront-auth/dev_will`; `kill -9` then redeploy re-acquired; destroy `13 delete`,
`makerkit-state` survived. Treated as manual verification per the recorded evidence.
**PASS (manual).** Automated: no CI assertion exercises the hosted-state path
specifically — `e2e-deploy.yml` verifies only the service-to-service round trip
(`e2e-verify.sh`), not zero-duplicate/lock/state-survival; and the CI-state decision
is undocumented at the workflow with now-stale comments (F02). Automated coverage of
the hosted-state guarantees: **absent.**

**AC6 (SI) — docs: `layering.md` Step 1 marked shipped-interim; Management API ask
filed and linked from `plan.md`.**
`layering.md` diff adds "Step 1 (shipped, client-side interim)…". `platform-ask.md`
exists and is linked from the top-level `plan.md:207` and the slice `plan.md`.
**PASS.**

**AC7 (DoD) — gates: typecheck / test / lint / lint:casts green; Opus review; DCO.**
lint:casts — no bare `as` added; sanctioned `blindCast`/`castAs` only: **PASS** by
inspection. typecheck/lint — not run in this pass; no obvious violations. Opus review +
fix round — done (plan.md D5, verified above). DCO — dual sign-off convention in use.
test — see AC4 (**WEAK**: the state/lock suites do not run in CI).

### Summary count

| Verdict | Count | ACs |
| --- | --- | --- |
| PASS | 4 | AC1, AC2, AC3, AC6 |
| PASS (manual, no automated CI coverage) | 1 | AC5 |
| WEAK | 2 | AC4 (correct assertions, skipped in CI), AC7 (test gate weak; rest pass) |
| FAIL / NOT VERIFIED | 0 | — |

Findings: 7 (F01-F07). Deferred: 6. The mechanism is correct and proven; the work to do
before relying on this in CI is F01 (make the state/lock tests actually run) and F02
(stop the e2e workflow's stale comments/guard from masking orphaned hosted state).
