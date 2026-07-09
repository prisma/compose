# ADR-0006: Every node is named; the root's name names the application

## Status

Accepted

## Decision

Every node — service or resource — carries an explicit, human-readable name,
given at authoring. When a node is deployed as the root, its name becomes the
application's name (on Prisma Cloud: the Project name). `makerkit deploy
--name` overrides it for a single run. Nothing derives a name from a
`package.json` or directory.

## Reasoning

Names serve two distinct jobs, and conflating them was the earlier mistake.

The first job is **diagnostics**: logs, deploy progress, errors. A graph walk
that reports "lowering `prisma-cloud/postgres`" is useless next to "lowering
`invoices-db`". Deploy addresses (the graph-position identifiers hexes assign
at `provision`) exist and remain the *identity* — config namespacing, Alchemy
resource ids — but they are positional and mechanical. A human-chosen name on
every node makes every log line and error self-describing. Hexes already had
names (`hex('storefront-auth', …)`); this extends the same property to
services and resources.

The second job is the **application name** at the root. That name is a
lifecycle boundary: it becomes the Project, so changing it means "destroy and
recreate my infrastructure". Something with those semantics must be pinned
deliberately in code — not inherited from a package name people rename freely,
and not defaulted from a directory. Zero-config convenience is the only
argument for deriving it, and it isn't worth an accidental
infrastructure-replacement.

The `--name` flag stays as an explicit override because CI genuinely needs it:
ephemeral end-to-end runs deploy the same app under per-run names so they never
collide with a standing deployment in a shared workspace.

## Consequences

- Node factories gain a name parameter; authoring gets slightly more verbose
  and considerably more debuggable.
- One nuance at the core layer: a connection end constructed by a surface with
  no room for a name argument (e.g. `rpc(contract)`, which takes only the
  contract) defaults its name to the connection's type. Pack factories that
  take an options object (`http({ name })`, `postgres({ name, … })`) still
  require the explicit name.
- Only the root's name has provisioning semantics; every other node's name is
  diagnostic. Identity remains the deploy address.
- Renaming a root remains a destructive operation — the docs and eventually the
  CLI should say so when they detect it.
- No name inference anywhere: a root without a name (and no `--name`) is a
  clear deploy-time error.

## Alternatives considered

- **Default the application name from `package.json`** — rejected: couples a
  destroy-and-recreate lifecycle boundary to a field with unrelated churn.
- **Names only at the root** — rejected: leaves every non-root log line and
  error naming nodes by type string and address only.

## Related

- [`ADR-0003`](ADR-0003-deploy-derives-everything-from-the-root-node.md) — how
  the root is determined.
- [`../10-domains/core-model.md`](../10-domains/core-model.md) — deploy
  addresses and node identity.
