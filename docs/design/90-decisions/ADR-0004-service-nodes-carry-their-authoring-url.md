# ADR-0004: Service nodes carry their authoring location (`url: import.meta.url`)

## Status

Accepted

## Decision

Every service factory takes the authoring module's URL:
`compute({ url: import.meta.url, … })`. At deploy, the CLI resolves a service's
directory from that URL by walking up to the **nearest `package.json`** — that
directory is the anchor against which the build adapter's `entry` paths resolve.
The field is deploy-time metadata only; nothing reads it at runtime.

## Reasoning

Assembly needs to know where each service lives on disk: the adapter's `entry`
("the built runnable is at `dist/server.js`") is relative to *something*, and
for a hex composing services from several directories, nothing in the model
carried that something. The graph is plain data; nodes have no back-reference
to the files that authored them.

The alternatives were inference (loader hooks or stack-trace capture in the
factory — magic, and fragile across runtimes) or declaration at the composition
site (`h.provision` taking paths — wrong place, since the hex shouldn't know
its children's layout). One explicit parameter at the service factory is boring
and robust: `import.meta.url` is evaluated in the authoring module, survives
any import path to the node, and makes the requirement a compile error rather
than a deploy-time surprise.

The nearest-`package.json` convention turns one input into the answer assembly
needs, without imposing project-layout rules. It is deliberately **not** a
one-service-per-package rule: two services in one package share the anchor and
name distinct entries (`dist/auth/server.js`, `dist/billing/server.js`).
The package boundary is a *resolution anchor*, not a service identity.

The field bends the "no machine paths on nodes" rule acceptably. Nodes ride
into runtime bundles, but bundlers preserve `import.meta.url` as an
*expression*, not a literal — inside the deploy artifact it re-evaluates to an
artifact-internal path that nothing reads. No dev-machine path is baked in, so
artifacts stay byte-deterministic. We considered a dead-code-branch pattern to
strip the field from user bundles and rejected it: the branch would live in
user source and the stripping in the user's bundler config, which MakerKit
does not control — so correctness must never depend on it. Deploy-only fields
are designed to be inert garbage at runtime instead.

## Consequences

- `url` becomes a required parameter of every service factory — one line of
  boilerplate per service, in exchange for zero inference machinery.
- The serialized-topology emit (future) must strip or relativize the URL; it is
  machine-specific and doesn't belong in a shareable artifact.
- The node-model documentation's "no machine paths" rule gains its one
  exception, named explicitly.
- A service authored outside any package (no `package.json` above it) has no
  anchor and fails at deploy with a clear error.

## Alternatives considered

- **Loader-hook / stack-trace inference** — zero boilerplate, but runtime-
  dependent magic (source maps, bun vs node stack formats) for something that
  must never mislocate a deploy.
- **Paths declared at `h.provision`** — puts a child's filesystem layout in the
  parent's wiring code and doesn't help the single-service root at all.
- **One-service-per-package rule** — would let the package *be* the service
  identity, but imposes a repo layout MakerKit has no business dictating.

## Related

- [`ADR-0003`](ADR-0003-deploy-derives-everything-from-the-root-node.md)
- [`ADR-0005`](ADR-0005-users-build-makerkit-assembles.md) — what assembly does
  from the anchored directory.
- [`../10-domains/deploy-cli.md`](../10-domains/deploy-cli.md)
