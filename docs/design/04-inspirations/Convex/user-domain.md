# Convex user domain map (research)

This doc focuses on the **user's mental model**: what concepts they name, configure, and rely on day-to-day — and how that maps to internal mechanics.

Source context: [Convex Developer Hub](https://docs.convex.dev)

## The user's ubiquitous language (what they "think in")

- **Table**: "where my app's data lives"
- **Schema**: "what shape my data must have; types and validation"
- **Query**: "how I read data; it stays up to date automatically"
- **Mutation**: "how I change data; it's transactional"
- **Action**: "how I call Stripe, OpenAI, etc.; when I need the outside world"

### The key user promise

The recurring flow is:

1. **Define a schema** (optional) for tables and document shapes.
2. **Write query and mutation functions** in `convex/`.
3. **Subscribe** with `useQuery` — the UI stays current without polling.
4. **Mutate** with `useMutation` — changes persist and queries update reactively.

That "subscribe once, get pushed updates" interaction model is the core behavioral difference vs traditional REST + refetch.

## User concepts vs internal mechanics (mapping)

| User concept | What it feels like | Internal-ish mechanism it implies |
|---|---|---|
| Query | "My view stays current" | Cached execution, WebSocket push when data changes |
| Mutation | "Change data; it's atomic" | Transactional execution, retries until confirmed |
| useQuery | "Data that updates itself" | Subscription lifecycle, reactive re-renders |
| Schema | "Guarantee correctness + types" | Runtime validation, generated `Doc<>` types |
| Action | "Call an API, then maybe write" | Non-deterministic execution, runQuery/runMutation for DB |

## Is the user's domain map the same as the system's?

Largely yes. Convex's mental model is intentionally close to the runtime:

- Users write functions; the backend runs them.
- Users subscribe; the backend pushes updates.
- The system hides WebSockets, caching, and transactional execution behind simple hooks and API calls.

The main indirection is **actions**: the recommended pattern (mutation → schedule action → action calls API → mutation stores result) adds a step that users must learn, but it keeps invariants and ordering on the server.

## Open questions / assumptions

- Assumption: Most Convex users think in "functions + database" rather than "collections + sync modes" (unlike TanStack DB). The server holds the source of truth.
- Open question: How much do users need to understand "deterministic" vs "non-deterministic" when choosing query/mutation vs action? (Docs explain it, but the boundary may be non-obvious.)

