# TanStack DB glossary (research)

This glossary is written from a DDD perspective: *terms*, *what they mean*, and *what operations exist on them*.

Source context: [TanStack DB Overview](https://tanstack.com/db/latest/docs/overview)

## Core terms

### Collection

A typed, normalized set of objects that can be **populated** (from fetch/sync/local sources) and then **queried** via live queries.

- **User-facing?** Yes. Users define and interact with collections directly.
- **Key operations**: create/configure, populate/sync, insert/update/delete (mutations), query (via live queries).

### Collection schema

An optional (recommended) schema attached to a collection to provide runtime validation, type transformations, defaults, and TypeScript inference.

- **User-facing?** Yes.
- **Key operations**: validate inputs, transform inputs, apply defaults.

### Live query

A reactive query over one or more collections that updates when underlying data changes in a way that would affect the result.

- **User-facing?** Yes (e.g. hooks).
- **Key operations**: subscribe/start, incrementally update result set, stop/unsubscribe.

### Query (query builder)

The composable query expression used to read and derive data from collections (filters, joins, ordering, projections). In TanStack DB, the query can also act as the **contract** for what data should be loaded/synced.

- **User-facing?** Yes.
- **Key operations**: build/compose, evaluate against local collections, (optionally) translate into “load subset” requests.

### Mutation (insert/update/delete)

An operation that changes collection data. TanStack DB emphasizes **optimistic application** of mutations, with persistence handled by user-provided handlers.

- **User-facing?** Yes.
- **Key operations**: apply optimistic change, call persistence handler, commit or rollback on outcome.

### Transaction (optimistic transaction)

A grouping mechanism for one or more mutations applied optimistically, with defined lifecycle and rollback behavior if persistence fails.

- **User-facing?** Yes (via APIs for actions/transactions).
- **Key operations**: begin, apply grouped mutations, persist, reconcile/rollback.

### Optimistic state (optimistic overlay)

The local, immediately-applied view of mutations that overlays the last known synced/immutable data until persistence completes.

- **User-facing?** Indirectly (users “feel” it as instant UI updates).
- **Key operations**: overlay reads, merge, rollback on error.

### Sync mode

The data-loading strategy used to populate and keep collections up to date.

From the overview:

- **Eager**: load entire collection up front.
- **On-demand**: load only what queries request (query-driven sync).
- **Progressive**: load query subset immediately, sync full dataset in background.

- **User-facing?** Yes (as configuration).
- **Key operations**: choose strategy, request subset, widen sync, dedupe/collapse requests.

### Derived collection (query result as a collection)

A live query’s result can itself be treated like a collection that can be queried further.

- **User-facing?** Conceptually yes.
- **Key operations**: materialize result set, keep incrementally updated.

## Internal-ish terms (helpful for modeling, not all are API)

### Local query engine

The engine evaluating queries against local normalized data and maintaining live query results.

- **User-facing?** No.

### Predicate → “load subset options”

The mapping from query predicates to a “load subset” request used by on-demand sync modes (the query becomes the API).

- **User-facing?** Partially (through behavior/config), not necessarily as a named object.

