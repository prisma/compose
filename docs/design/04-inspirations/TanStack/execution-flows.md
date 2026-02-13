# TanStack DB execution flows (research)

This document captures the “always happening” flows that define the TanStack DB interaction pattern — especially **live queries** continuously updating consumers.

Source context: [TanStack DB Overview](https://tanstack.com/db/latest/docs/overview)

## Flow 1: Live query lifecycle (the core loop)

### 1) Define collections

User defines one or more collections (with optional schemas, sync config, persistence handlers).

### 2) Subscribe/bind a live query

User code subscribes to a live query (e.g. via a hook) that:

- reads from one or more collections
- returns a result set to a consumer (component)

### 3) Maintain incrementally

When any relevant underlying collection data changes:

- the live query result updates **reactively**
- the consumer re-renders/updates with the new result

Key property: updates are incremental — the system is designed so “staying live” remains fast even as data size grows. (Performance claims and the incremental model are emphasized in the overview.)

## Flow 2: On-demand sync (query becomes the contract)

In on-demand mode, the user’s active queries drive what the system loads:

1. User subscribes to a query with predicates (filters).
2. The system translates predicate intent into subset-load parameters (“load what this query needs”).
3. Data is fetched/synced and inserted into the underlying collections.
4. The live query re-evaluates incrementally and delivers results.

Important: this reduces “endpoint sprawl” by avoiding bespoke view-specific APIs — the query shape/predicate becomes the input contract. ([TanStack DB Overview](https://tanstack.com/db/latest/docs/overview))

## Flow 3: Optimistic mutation (instant inner loop, async outer loop)

1. User performs a mutation (insert/update/delete) on a collection.
2. The system applies the change optimistically to the local view immediately.
3. A persistence handler runs asynchronously to write to the backend.
4. On success:
   - authoritative data is synced back in (or otherwise confirmed)
   - optimistic state is cleared/merged
5. On failure:
   - optimistic state is rolled back
   - consumer state returns to the last confirmed view

## Flow 4: Progressive sync (fast first paint, background convergence)

1. Subscribe to a query → load subset immediately (like on-demand).
2. In parallel, widen sync toward the full dataset in the background.
3. Consumers continue to see up-to-date results as more data becomes locally available.

