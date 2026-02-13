# Convex glossary (research)

This glossary is written from a DDD perspective: *terms*, *what they mean*, and *what operations exist on them*.

Source context: [Convex Developer Hub](https://docs.convex.dev)

## Core terms

### Table

A named container for documents. Tables are created implicitly when the first document is inserted; no upfront schema is required.

- **User-facing?** Yes. Users reference tables in `ctx.db` operations and schema definitions.
- **Key operations**: insert (creates table if needed), query, patch, replace, delete.

### Document

A JSON-like object stored in a table. Documents have fields and values; they may reference other documents via document IDs.

- **User-facing?** Yes (as the unit of read/write).
- **Key operations**: insert, get, query, patch, replace, delete.

### Schema

An optional (recommended) description of tables and document types, defined in `convex/schema.ts`. Provides runtime validation and TypeScript inference. Uses the same `v` validator builder as function argument validation.

- **User-facing?** Yes.
- **Key operations**: define tables, declare document shapes, add indexes.

### Query (function)

A deterministic, cached function that reads from the database and returns data. Queries are automatically subscribable — clients receive new results when underlying data changes.

- **User-facing?** Yes.
- **Key operations**: define handler, call from client (one-off or via subscription), subscribe via `useQuery` for reactivity.

### Mutation (function)

A deterministic function that writes to the database. Mutations run as transactions: all reads see a consistent snapshot; all writes commit together or not at all.

- **User-facing?** Yes.
- **Key operations**: define handler, call from client via `useMutation`. React client executes mutations one-at-a-time in an ordered queue per client.

### Action (function)

A non-deterministic function that can call external APIs (fetch, Stripe, etc.). Actions access the database only indirectly via `ctx.runQuery` and `ctx.runMutation`. Not cached, not reactive, not transactional.

- **User-facing?** Yes (for third-party integrations).
- **Key operations**: define handler, call from client via `useAction`. Recommended pattern: mutation writes intent → schedules action → action calls API → mutation stores result.

### Subscription (reactive query)

The client-side binding to a query that receives push updates when underlying data changes. Created when `useQuery` is used; released when the component unmounts.

- **User-facing?** Yes (via `useQuery` hook).
- **Key operations**: subscribe (implicit on first `useQuery` call), receive incremental updates, unsubscribe (implicit on unmount).

### Optimistic update

A temporary, local change to query results applied before a mutation completes. Configured via `.withOptimisticUpdate()` on the mutation. Rolled back when the mutation finishes and authoritative data arrives.

- **User-facing?** Yes (optional enhancement).
- **Key operations**: register update function, apply on mutation call, roll back on completion.

## Internal-ish terms (helpful for modeling)

### Convex backend

The server-side deployment that executes functions, stores documents, and pushes query results over WebSockets.

- **User-facing?** Indirectly (deployment URL, `npx convex dev`).

### Generated API

The `api` object in `convex/_generated/api` that maps file/export paths to function references. Enables end-to-end type safety and autocompletion when calling functions from the client.

- **User-facing?** Yes (as the primary way to reference functions).

### Query context / Mutation context

The `ctx` object passed to handlers (QueryCtx, MutationCtx). Provides `db`, `auth`, `storage`, etc. QueryCtx is read-only; MutationCtx adds write capability.

- **User-facing?** Yes (within function authors' mental model).

## Open questions / assumptions

- Assumption: Convex's "subscription" is a server-push model; the client does not poll. (Verified: WebSocket provides 2-way channel; Convex pushes new results reactively.)
- Assumption: Caching is server-side; many clients requesting the same query + args receive cached response. (Documented but caching granularity not fully specified.)
- Open question: How does Convex's reactive model handle large result sets or many concurrent subscriptions? (Pagination exists; incremental/delta delivery mechanics not fully documented here.)

