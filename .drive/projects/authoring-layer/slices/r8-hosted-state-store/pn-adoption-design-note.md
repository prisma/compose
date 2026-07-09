# Design note — Prisma Next inside the hosted state store (deferred)

Status: **deferred by operator decision (2026-07-09, PR #17 review).** Rationale:
complex, risks becoming a rabbit hole, little to gain while the store's data
access is 12 trivial CRUD queries. This note captures the verified facts so a
future slice starts from evidence, not re-derivation.

## What this would be

Replace the state store's hand-written SQL layer with Prisma Next:

- the two tables (`alchemy_resource_state`, `alchemy_stack_output`) authored as
  a PN contract (contract-space-package layout: `src/contract.prisma`, emitted
  artifacts committed);
- `service.ts`'s hand SQL replaced by `db.orm` CRUD (upsert supported);
- `schema.ts`'s `create table if not exists` replaced by the **programmatic
  control API** at bootstrap;
- one shared `pg.Pool` between the PN runtime (its `pg:` BYO-pool option) and
  the advisory lock.

## Verified facts (checked against published `@prisma-next/*@0.14.0`, 2026-07-09)

- **The programmatic schema-apply surface exists**: `createPostgresControlClient(
  { connection })` from `@prisma-next/postgres/control` returns a `ControlClient`
  with `dbInit`, `dbUpdate`, `dbVerify`, `migrate`, `sign`, `introspect`, `emit`.
  The CLI is a wrapper over this API.
- **`dbUpdate({ contract, mode: 'apply', connection })` is the bootstrap-shaped
  op**: reconciles the DB to the contract and writes the marker/ledger itself;
  refuses destructive plans unless `allowDestructive` — a good property for a
  state store. (`dbInit` requires an on-disk `migrationsDir`; wrong shape for an
  embedded reconcile-at-boot store.)
- **The runtime fits a library**: `postgres<Contract>({ contractJson, url })`
  takes an explicit DSN (no `.env` coupling); `pg:` accepts a caller-owned
  `pg.Pool`; `db.close()` lifecycle; construction is lazy/inert.
- **Skills gap found**: the installed PN skills present the schema lifecycle as
  CLI-only and never document the control client's operations — an agent
  following them concludes (wrongly) that programmatic apply is unsupported.
  Worth filing as PN docs/skill feedback when this is picked up.

## Why deferred (the costs)

1. **The lock port.** PN rides node-postgres; the advisory-lock code is built on
   postgres.js's `sql.reserve()`. Porting `lock.ts` to a dedicated `pg` client
   (`pool.connect()`) rewrites the most safety-critical file and re-runs its
   whole real-Postgres proof suite (contention, crash-release,
   `pg_terminate_backend` lease-loss).
2. **Rework of proven code.** R8's store is live-proven and double-reviewed;
   adoption rewrites most of its data access and re-incurs the live-proof
   burden (deploy, no-op redeploy, lock checks, destroy).
3. **Fidelity re-proof.** Alchemy's `__redacted__`/`__duration__` jsonb
   envelopes must round-trip byte-identically through PN's Json codec — the
   same test matrix `state.test.ts` runs today, rebuilt on the PN lane.
4. **Thin gain today.** The queries are key-value CRUD already typed at the
   `StateService` boundary; PN's contract/migration machinery adds most value
   when the schema or queries grow, which this store's may never do
   (the platform StateApi is the intended end state — see `platform-ask.md`).

## Pick-up triggers

Revisit when any of: the store grows real query/schema complexity; dogfooding
PN-in-a-library becomes a priority worth the re-proof cost; or the platform
StateApi lands (in which case the client-side store shrinks or dies, and this
note may close as obsolete instead).
