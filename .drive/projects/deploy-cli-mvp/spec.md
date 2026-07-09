# Deploy CLI MVP — Project Spec

## Purpose

Give app authors the standard MakerKit deploy path: point one command at their
app module and get a deployed application — no stack file, no config file, no
hand-maintained bundle map. This closes the last hand-written seam between
authoring and hosting (the interim `alchemy.run.ts`) and turns the
descriptor/assembly split from a design promise into shipped mechanism.

## At a glance

```sh
# the app builds itself first (its own tooling / turbo), then:
makerkit deploy src/service.ts     # or app.ts exporting a hex
makerkit destroy src/service.ts
```

The CLI imports the module, Loads the graph, infers the target pack from the
nodes and constructs it from the environment (`fromEnv()`), assembles each
service from its `url` anchor, then calls `lower()` and drives the Alchemy
stack. Design is settled and recorded — this project implements, it does not
re-open design:

- [ADR-0003](../../../docs/design/90-decisions/ADR-0003-deploy-derives-everything-from-the-root-node.md) — no config file; everything derived from the root node.
- [ADR-0004](../../../docs/design/90-decisions/ADR-0004-service-nodes-carry-their-authoring-url.md) — `url: import.meta.url`; nearest `package.json` anchors resolution.
- [ADR-0005](../../../docs/design/90-decisions/ADR-0005-users-build-makerkit-assembles.md) — users build; MakerKit assembles from built output.
- [ADR-0006](../../../docs/design/90-decisions/ADR-0006-every-node-is-named.md) — every node named; root's name names the application.
- [deploy-cli.md](../../../docs/design/10-domains/deploy-cli.md) — pipeline, contracts, error surface.

Supersedes the pre-design brief
`.drive/projects/authoring-layer/makerkit-deploy-cli-brief.md` (its §1 config
file, §3 value→location, and §4 build-orchestration questions are all settled
by the ADRs).

## Non-goals

- `makerkit build`, `makerkit dev`, `logs`, topology emission.
- The `makerkit.config.ts` escape hatch (future optional override, not MVP).
- Freshness/staleness detection of built output (missing-only).
- Deterministic Next standalone artifacts (known follow-up; no idempotence
  assertion on the Next path).
- Typed connection interfaces / generated clients (the `rpc-contracts` track).
- Hosted Alchemy state store; multi-target applications.
- Loader shims for Node < 22.18 (the CLI supports node + bun; old-Node users
  use bun); deno support.
- A node example app (the CLI is node-clean and node-tested; the live e2e
  examples are bun apps).

## Place in the larger world

Builds directly on the authoring-layer project's R5 (descriptor-only build
adapters, `run`/`load`, pack `package()`/`deploy()` — all merged to main).
Consumes: Alchemy `2.0.0-beta.59` as the provisioning engine, Prisma Cloud as
the (only) target pack, the repo e2e workflow as the proving ground.

**Parallel-track coordination (resolved):** R6 rpc-contracts merged mid-flight
(PR #13, `packages/makerkit-rpc`); this project rebased onto it. The one
collision was benign and is recorded in ADR-0006's consequences:
`rpc(contract)` has no name slot, so core's `connectionEnd()` name is optional
(defaults to the type) while pack factories require it. This project still
does not change `http.ts`/rpc hydrate or interface semantics.

## Cross-cutting requirements

- **Plane separation invariants** (extend the existing invariant guard tests):
  authoring entries (`@makerkit/node`, `@makerkit/nextjs`, pack light entry)
  stay lean — no `node:`/`alchemy`/`bun` imports; assembly and CLI code is
  deploy-only and never reachable from a runtime bundle; `@makerkit/core`
  authoring entry still imports nothing.
- **Runtime portability check (operator-added):** a lint/invariant check over
  all `packages/` sources — no runtime references that don't resolve under
  both node and bun. Concretely: `bun` module imports, `bun:` schemes, and
  `Bun.` globals are banned everywhere in `packages/`; `node:` builtins are
  allowed in deploy-only code (bun implements them) but stay banned in
  authoring entries per the invariant above.
- **Doc-first covenant:** a forced deviation from the ADRs or `deploy-cli.md`
  is flagged to the operator and the doc amended first — never a silent
  divergence.
- **Error surface is product surface:** every failure in deploy-cli.md's error
  table names its fix (the table is the checklist).
- **Secrets:** never print `PRISMA_SERVICE_TOKEN` or any secret; deploys run
  under the bot credential flow.
- **Repo quality floor:** strict TypeScript, Biome, existing test layout;
  CI typecheck/test/build stays green on every slice PR.

## Transitional-shape constraints

- The interim `alchemy.run.ts` files and `LowerOptions.bundle(s)` stay working
  until the final slice deletes them — intermediate slices must not break the
  current deploy path or the e2e workflow.
- `lower()`/`lowering()` are wrapped, never rewritten; they remain the
  mixed-stack escape hatch.

## Project DoD

- [ ] `makerkit deploy` deploys **both** examples to real Prisma Cloud from a
      clean checkout: `makerkit-hello` serves `select 1`; `storefront-auth`
      renders `Auth /verify says: 200 {"ok":true}`.
- [ ] `makerkit destroy` tears both down clean.
- [ ] No `alchemy.run.ts`, no hand-rolled bundle scripts, no user-facing
      bundle map anywhere in `examples/`.
- [ ] `.github/workflows/e2e-deploy.yml` drives `makerkit deploy`/`destroy`
      (with `--name` for the ephemeral run) and is green on main.
- [ ] Idempotent redeploy is a no-op on the `node` path (`Plan: … to noop`);
      the Next path's non-determinism is documented, not asserted.
- [ ] Every error in deploy-cli.md's table is exercised by a test.
- [ ] Docs synced: core-model.md's "MakerKit-owned deploy entrypoint"
      extension point moved to done for what shipped; deploy-cli.md's open
      implementation questions resolved in place.
- [ ] Invariant guards green; typecheck/test/Biome green.

## Open questions

None. The implementation calls are settled with the operator in
`design-notes.md`: runtime-agnostic bin (node ≥ 22.18 + bun); the CLI
generates a readable `.makerkit/alchemy.run.ts` and shells to the `alchemy`
CLI; entry path required (no discovery convention); no `.env` sourcing.

## References

- `docs/design/10-domains/deploy-cli.md` (the contract)
- `docs/design/90-decisions/ADR-0003…0006`
- `docs/design/10-domains/core-model.md` §§ Lowering, build adapter, Extension points
- `.drive/projects/authoring-layer/makerkit-deploy-cli-brief.md` (superseded pre-design brief; constraints absorbed here)
- `.github/workflows/e2e-deploy.yml` (the proving ground)
