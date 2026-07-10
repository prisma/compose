# ADR-0013: Resources are provisioned by hexes; a service's deps are declarations

## Status

Accepted

## Decision

A resource exists in exactly one place: a hex provisions it. `ResourceNode` is
an identity — `{ name, pack, type }` — and the only way one enters the graph is
`h.provision(id, resource)`, which returns a typed `ResourceRef`. A service
never holds a resource: its `deps` admit only **declarations** — `ResourceEnd`
(a resource slot) and `ConnectionEnd`. The hex wires the one provisioned
resource into each consumer's slot, and the wiring is type-checked against the
slot's declared resource type at the `provision` call site and re-checked at
Load.

On top of that model, the pack ships **one** `postgres()` whose argument shape
picks the role: `{ name }` is the provisionable identity, `{ client }` is a
service's dependency slot, and `{ name, client }` is the **dual** — an identity
that can also sit directly in `deps` because it implements core's conversion
interface, `Dependable<C, T>`: `toDependency()` returns the `ResourceEnd` the
value stands for. `service()` performs the conversion at construction, so
everything downstream of the factory still sees only ends.

## Reasoning

Take two services sharing one database — an ingestion service that writes
readings into Postgres and an API service that reads them back out. The system
has **one** database; that is not an optimization but the point: both services
see the same rows.

Suppose a service could embed a resource in its own `deps` and deploy would
conjure a database out of the mention. If the API service writes the same line,
a **second** database appears, because nothing in two separate mentions says
"the same one". Two rules break at once. First, infrastructure appears
implicitly: mentioning a dependency creates a stateful, billable thing, with no
single place in the code that says the database exists. Second, sharing is
inexpressible: identity by mention means one instance per mention, so the
ingestion service and the API can never see the same rows. Sharing by *name
coincidence* (two mentions with the same `name` string merge) would fix the
second problem by making the first worse — now a typo forks your data, and a
match silently aliases it.

The fix is to separate the two things the embedded resource was conflating:

- **What a service needs** is a declaration: "a Postgres, hydrated into this
  client type." That is `ResourceEnd` — a slot in `deps`, exactly parallel to
  the `ConnectionEnd` a service declares for another service. It carries the
  connection face (config params + the `hydrate` client factory) and provisions
  nothing.
- **What exists** is an identity: `ResourceNode`, owned by whoever composes the
  system. Only a hex may provision one, under a stable id, and the returned
  `ResourceRef` is the only handle that can fill a slot.

The hex body is then the one place the shared database is legible:

```ts
export default hex("datahub", (h) => {
  const db = h.provision("db", postgres({ name: "db" }))
  h.provision("ingest", ingestService, { db })
  h.provision("api", apiService, { db })
})
```

One `provision` call, one database; two wirings, two consumers. The graph
records it the same way: one resource node, and one `resource` edge per
consumer (from the resource to the service, labeled with the consumer's input
name) — the same producer-to-consumer shape a `connection` edge has. Lowering
follows the graph, so the resource lowers exactly once no matter how many
services consume it, and each consumer's `Config` resolves its slot through its
own edge to the same outputs. Each service still gets its own config keys
(`INGEST_DB_URL`, `API_DB_URL`) carrying the same value — the runtime side is
untouched, because a `ResourceEnd` hydrates through exactly the machinery an
embedded resource would have used.

The slot's `type` is a literal (`"postgres"`), carried on both the end and the
ref, so wiring a slot to a resource of another type is rejected by the compiler
at the `provision` call site; Load re-checks the same relation at runtime, as a
backstop against casts. A bare `ResourceNode` in `deps` is rejected by the
types and a targeted LoadError at runtime — a service cannot cause
infrastructure to exist by mentioning it, in the same way it cannot conjure the
service it calls.

The composition rule falls out: a service deployed directly as the root may
carry no dependency slot at all, because nothing at the root wires or
provisions for it. The error points at deploying the composing hex — the same
rule, and the same message shape, that unwired connection inputs always had.

That settles the model. The authoring surface it leaves behind is the common
case's tax: a single-consumer app (one service, its one database) has to hold
two values for one concept — the identity in the hex, the slot in the service —
made with two differently-named factories, with the relationship between them
existing only in the reader's head. The resource *is* one thing to that app; it
should be one value:

```ts
// service.ts — one value: the identity AND this service's dependency on it
export const db = postgres({ name: "db", client: ({ url }) => new SQL({ url }) })
export default compute({ name: "hello", deps: { db }, ... })

// hex.ts — provisions that same object, wires it back into the slot
export default hex("hello", (h) => {
  const dbRef = h.provision("db", db)
  h.provision("hello", service, { db: dbRef })
})
```

What makes this sound rather than a hole in the model is the **conversion
interface**. The dual value is an identity — kind `"resource"`, provisionable —
that additionally implements `Dependable`: `toDependency()` builds the
`ResourceEnd` it stands for (carrying the identity's name as the slot's
diagnostic name). `toDependency()` must be pure — it constructs a node and runs
no user behavior, the same rule a factory obeys at import; the client factory
still runs only at hydration. `Deps` admits `Dependable` values, and
`service()` converts each one at construction, so `node.inputs` stores only
ends and Load, `configOf`, `hydrate`, and deploy are untouched. The type
machinery sees through the conversion: a `Dependable<C, T>` entry hydrates to
`C` and wires like a `ResourceEnd<C, T>`, literal `T` preserved — so the hex
wiring for a dual slot is checked exactly as for an explicit one. The rule
"deps admit only declarations" survives intact: a dual is admitted *because* it
can describe its declaration, and what is stored is the declaration.

## Consequences

- **Sharing is expressible and the default is honest.** One provision, N
  wirings. A second database is a second `provision` call — visible in review,
  never an accident of mention counting.
- **No implicit infrastructure.** Every stateful, billable thing traces to one
  `h.provision` line. The hex body is the inventory.
- **One factory per resource type, three shapes.** The shapes are mutually
  exclusive in the types (`?: never`) and re-checked at runtime for plain JS.
  Community packs get the same pattern for free: implement `Dependable` on any
  provisionable value and `service()` does the rest.
- **The dependency declaration still carries the client factory.** A connection
  with a contract shouldn't imply a client — the declaration ought to be pure
  need, with the client bound elsewhere. That coupling predates this decision
  and is accepted for now so `load()` can return ready, typed clients without
  the pack shipping a driver; untangling it is deferred work (tracked in
  `.drive/deferred.md`).
- **The dual carries exactly one client.** Consumers that need different
  drivers for the same database use the split shapes: one `{ name }` identity
  in the hex, a `{ client }` slot per consumer.
- **Even a single-service app with a database needs a small hex** to provision
  and wire it. Dependency-less services still deploy directly.
- **Lowering stays a graph walk.** The resource ctx `id` is the hex provision
  id; targets need no dedup and no knowledge of consumers.

## Alternatives considered

- **Inline auto-create: keep resources in `deps` and provision one per
  mention.** Rejected: infrastructure appears implicitly, and two services can
  never share one instance — the failure modes that motivated the model.
  Merging mentions by name string would trade implicit creation for implicit
  aliasing.
- **Reuse the ConnectionEnd/Contract machinery for resources.** The slot shape
  is deliberately parallel, but the checking is not the same thing: a resource
  type is a routing key (`"postgres"`), not a contract with a `satisfies()`
  relation — there is no interface to be width-compatible against. And the
  producers differ in kind: a connection's producer is a service whose outputs
  exist only after *deploy*, while a resource is lowered by the target's
  resource table before any consumer. Folding them together would force both
  differences through one mechanism that fits neither.
- **Two factories per resource type** (`postgres` for the identity, a second,
  differently-named factory for the slot). Explicit and sound — but the single-consumer
  case pays a permanent two-vocabulary tax: two imports, two values, and the
  identity↔slot relationship never expressed in code. The one-factory surface
  keeps the same model underneath and lets the common case say it once.
- **Argument-shape overloads alone, without the conversion interface.** One
  name, but the dual shape would have to return *something*: an identity can't
  sit in `deps`, a slot can't be provisioned, and no single node can be both
  (kinds are disjoint by design). Overloads select a return type; they cannot
  make one value fill two positions. The conversion interface is exactly the
  missing half.
- **A subtype or intersection that IS both nodes** — one object carrying kind
  `"resource"` *and* a slot's connection face, admitted by `Deps` directly.
  Rejected: it resurrects the embedded-resource shape the model exists to kill
  — Load could no longer tell a legal dual from an illegal bare resource
  without inspecting for the extra face, and the "does mentioning it provision
  it?" ambiguity returns. Conversion keeps the kinds disjoint: the dual is an
  identity that *describes* a slot, and only the slot enters the graph.

## Related

- [`../10-domains/core-model.md`](../10-domains/core-model.md) — the type-level
  design this decision shapes (ResourceNode/ResourceEnd/Dependable, HexBuilder,
  lowering).
- [`ADR-0003`](ADR-0003-deploy-derives-everything-from-the-root-node.md) — the
  composing-hex error surface this extends to resource slots.
- [`ADR-0006`](ADR-0006-every-node-is-named.md) — node naming; a provisioned
  resource's address is its hex provision id.
