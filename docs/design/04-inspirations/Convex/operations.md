# Convex operations (research)

This document enumerates the "verbs" (operations) on the core domain concepts, as implied by the Convex model.

Source context: [Convex Developer Hub](https://docs.convex.dev)

## Operations on schema / data model

- **Define a schema (optional)**
  - Create `convex/schema.ts` with `defineSchema`, `defineTable`, and `v` validators.
  - Tables spring into existence on first insert even without schema.
- **Define indexes**
  - Attach `.index(name, ...)` to tables in the schema for faster queries.
- **Push schema**
  - `npx convex dev` and `npx convex deploy` automatically validate and push schema changes.
  - First push after schema add/modify validates all existing documents.

## Operations on query functions

- **Define a query**
  - Export a function built with `query({ args, handler })` from a file in `convex/`.
  - Handler receives `(ctx, args)` and returns serializable data.
  - Must be deterministic (no `fetch`, no non-deterministic APIs in handler).
- **Call a query from the client**
  - One-off: `convex.query(api.module.fn, args)` via `useConvex()`.
  - Reactive: `useQuery(api.module.fn, args)` — subscribes and rerenders when data changes.
  - Skip: pass `"skip"` instead of args to disable the subscription.
- **Subscribe to a query**
  - Using `useQuery` creates a subscription; unmounting cancels it.
  - Convex pushes new results over WebSocket when underlying data changes.

## Operations on mutation functions

- **Define a mutation**
  - Export a function built with `mutation({ args, handler })` from a file in `convex/`.
  - Handler receives `(ctx, args)`; can use `ctx.db` to insert, patch, replace, delete.
  - Runs as a transaction; must be deterministic.
- **Call a mutation from the client**
  - `useMutation(api.module.fn)` returns an async function; call with args.
  - Mutations from a single React client run one-at-a-time in an ordered queue.
  - Convex React retries automatically until the mutation is confirmed written.
- **Add optimistic update**
  - Chain `.withOptimisticUpdate((localStore, args) => { ... })` on the mutation.
  - Use `localStore.getQuery` and `localStore.setQuery` to patch local state; rolled back on completion.

## Operations on action functions

- **Define an action**
  - Export a function built with `action({ args, handler })` from a file in `convex/`.
  - Handler can `fetch`, call external APIs; accesses DB via `ctx.runQuery`, `ctx.runMutation`.
  - Can opt into Node.js runtime via `"use node"` directive.
- **Call an action from the client**
  - `useAction(api.module.fn)` — returns async function.
  - No automatic retries; no optimistic updates.

## Operations on tables / documents

- **Insert a document**
  - `ctx.db.insert(table, document)` — creates table if needed.
- **Read documents**
  - `ctx.db.get(table, id)` — single doc by ID.
  - `ctx.db.query(table).withIndex(...).order(...).take(n)` — query with filters.
- **Update documents**
  - `ctx.db.patch(table, id, partial)` — merge fields.
  - `ctx.db.replace(table, id, document)` — full replace.
- **Delete documents**
  - `ctx.db.delete(table, id)`.

## Open questions / assumptions

- Assumption: Indexes are defined in schema; query API uses `.withIndex(name, predicate)`. (Verified from schema and reading-data docs.)
- Open question: Exact semantics of "query caching" — invalidation, staleness, multi-tenant behavior.

