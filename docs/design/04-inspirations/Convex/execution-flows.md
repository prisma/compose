# Convex execution flows (research)

This document captures the common execution flows that define the Convex interaction pattern — especially the loop: **define schema, write functions, query/subscribe, mutate, see realtime updates**.

Source context: [Convex Developer Hub](https://docs.convex.dev)

## Flow 1: The core developer loop (schema → functions → subscribe → update)

### 1) Define schema / data model

User adds `convex/schema.ts` with `defineSchema` and `defineTable`. Tables can also emerge implicitly on first insert. Schema is optional but recommended for types and validation.

### 2) Write functions

User creates files in `convex/` exporting:
- **Queries**: read from `ctx.db`, return data.
- **Mutations**: write via `ctx.db.insert/patch/replace/delete`.
- **Actions** (optional): call external APIs via `ctx.runQuery`/`ctx.runMutation` for DB access.

### 3) Run `npx convex dev`

CLI syncs functions and schema to the dev deployment. Generates `convex/_generated/api` and type definitions. Keeps running to push changes.

### 4) Query / subscribe from the client

User wraps the app in `ConvexProvider` and uses `useQuery(api.module.fn, args)` in components. The first `useQuery` creates a subscription; Convex pushes results over WebSocket. Component rerenders when data changes.

### 5) Update data via mutation

User calls `useMutation(api.module.fn)` and invokes the returned function with args. Mutation runs on the server, commits transactionally. Convex pushes updated query results to subscribers.

### 6) See realtime updates

Subscribed components receive new query results without refetch or manual invalidation. The WebSocket delivers updates as soon as the mutation is committed.

Key property: **reactive by default**. Every `useQuery` is a live subscription; no separate "subscribe" API.

## Flow 2: Optimistic update (optional faster feedback)

1. User chains `.withOptimisticUpdate((localStore, args) => { ... })` on a mutation.
2. When the mutation is invoked, the update function runs immediately.
3. It uses `localStore.getQuery` and `localStore.setQuery` to temporarily modify visible query results.
4. When the mutation completes, Convex pushes authoritative results; the optimistic overlay is rolled back.
5. If the optimistic shape was wrong, the UI flickers once and then shows correct data.

Important: optimistic updates are client-configured; the server does not participate.

## Flow 3: Action (external API call)

1. User defines an action that calls `fetch` or another external API.
2. Recommended: client calls a mutation; mutation writes intent to DB and schedules an action via `ctx.scheduler.runAfter(0, internal.action, args)`.
3. Action runs, calls external API, then calls `ctx.runMutation` to store the result.
4. Queries that read that data update reactively when the mutation commits.

This pattern keeps ordering, prevents duplicate calls, and centralizes invariants in mutations.

## Flow 4: Consistency across multiple useQuery call sites

Convex guarantees that if a mutation changes data read by multiple `useQuery` subscriptions, the app never renders a state where only some of them reflect the new data. All subscribers see a consistent view.

## Open questions / assumptions

- Assumption: `useQuery` subscriptions are per-query-per-args; changing args creates a new subscription. (Implied by API; exact semantics not fully documented.)
- Assumption: Mutation retries are transparent; Convex ensures each mutation executes at most once despite retries. (Documented for React client.)
- Open question: How does Convex handle subscription "fan-out" — many clients subscribing to the same query with same args? (Caching presumably helps; details not specified.)

