# TanStack DB operations (research)

This document enumerates the “verbs” (operations) on the core domain concepts, as implied by the TanStack DB model.

Source context: [TanStack DB Overview](https://tanstack.com/db/latest/docs/overview)

## Operations on collections

- **Define a collection**
  - Configure identity/keying, schema, sync mode, and persistence handlers.
- **Populate a collection**
  - Load data from:
    - fetch (e.g. REST via TanStack Query)
    - sync engine (e.g. ElectricSQL)
    - local stores (e.g. LocalStorage)
- **Read from a collection**
  - Direct lookups (conceptual) and via live queries.
- **Write to a collection (mutate)**
  - Insert, update, delete:
    - apply optimistic change immediately
    - invoke persistence handler
    - reconcile or rollback based on outcome

## Operations on queries / live queries

- **Compose a query**
  - Build a query over one or more collections (filters/where, joins, ordering, projections).
- **Subscribe to a live query**
  - Start: compute initial result; ensure required data is loaded (depending on sync mode).
  - Maintain: update results incrementally as underlying data changes.
  - Stop: release subscription when component unmounts / consumer stops.
- **Derive collections from queries**
  - Treat query results as another “collection-like” object that can be further queried.

## Operations on optimistic mutations / transactions

- **Perform an optimistic mutation**
  - Apply local changes immediately (optimistic overlay).
  - Persist asynchronously (handler).
  - Roll back on error.
- **Group mutations into a transaction/action**
  - Apply multiple coordinated changes under a single lifecycle.
  - Persist and reconcile as a unit (conceptually).

## Operations related to sync modes

- **Eager**
  - Load whole collection up front.
- **On-demand**
  - Load only what active queries request (query-driven sync).
  - Collapse/dedupe load requests; expand/delta load when a query widens.
- **Progressive**
  - Load query subset immediately.
  - Continue syncing additional (or full) dataset in the background.

