# TanStack DB user domain map (research)

This doc focuses on the **user’s mental model**: what concepts they name, configure, and rely on day-to-day — and how that maps to internal mechanics.

Source context: [TanStack DB Overview](https://tanstack.com/db/latest/docs/overview)

## The user’s ubiquitous language (what they “think in”)

- **Collection**: “where my app’s data lives locally”
- **Schema**: “what shape data must have; how types/defaults/transforms are applied”
- **Live query**: “how my component reads data and stays up to date”
- **Mutation**: “how I change data and persist it”
- **Sync mode**: “how much data gets loaded, when”

### The key user promise

The recurring flow is:

1. **Write a query** describing the data the UI needs.
2. **Bind it** (subscribe) so the consumer continuously sees an up-to-date result.
3. **Mutate** data optimistically and let persistence happen asynchronously.

That “continuous update” interaction model is the core behavioral difference vs traditional request/response + refetch caching.

## User concepts vs internal mechanics (mapping)

| User concept | What it feels like | Internal-ish mechanism it implies |
|---|---|---|
| Collection | A local, normalized store | Data ingestion + normalization + keying |
| Live query | “My view stays current” | Incremental query maintenance over changing inputs |
| Mutation | “Update instantly, then persist” | Optimistic overlay + persistence handler + rollback |
| Sync mode | “Load everything vs only what I need” | Subset loading, request collapsing, background widening |
| Schema | “Guarantee correctness + types” | Runtime validation + transforms/defaults |

## Is the user’s domain map the same as the system’s?

Not exactly — but it’s intentionally **close**.

TanStack DB’s user model is powerful because:

- the user-facing terms align tightly with the runtime behavior they observe
- the system hides most plumbing (query engine, delta updates, request collapsing) without inventing new abstractions

The internal model exists mostly to uphold the user-level promises:

- “query stays live”
- “mutations feel instant”
- “network isn’t on the interaction path”

