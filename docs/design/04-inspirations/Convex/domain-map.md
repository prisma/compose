# Convex domain map (research)

This is a conceptual map of the Convex domain: the *things* that exist and how they relate.

Source context: [Convex Developer Hub](https://docs.convex.dev)

```mermaid
flowchart LR
  subgraph User_Surface[User-facing surface]
    T[Table]
    D[Document]
    S[Schema]
    Q[Query function]
    M[Mutation function]
    A[Action function]
    SUB[Subscription\nvia useQuery]
    OU[Optimistic update]
  end

  subgraph Backend[Convex backend]
    DB[(Database)]
    QC[Query cache]
    WS[WebSocket\npush]
    EXQ[Query executor]
    EXM[Mutation executor\ntransactional]
    EXA[Action executor\nnon-deterministic]
  end

  subgraph Client[Client]
    CQ[useQuery]
    CM[useMutation]
    CA[useAction]
  end

  S --> T
  T --> D
  DB --> T

  Q --> EXQ
  EXQ --> DB
  EXQ --> QC
  M --> EXM
  EXM --> DB
  A --> EXA
  EXA -.runQuery/runMutation.-> DB

  CQ --> SUB
  SUB --> WS
  WS --> QC
  QC --> SUB

  CM --> M
  CA --> A

  OU -.optional.-> SUB
  CM -.withOptimisticUpdate.-> OU
```

## Notes

- The user primarily thinks in: **tables**, **queries**, **mutations**, and **actions**.
- The backend makes this work by:
  - **caching** query results and pushing updates when data changes
  - **transactions** for mutations (all-or-nothing, consistent reads)
  - **WebSocket** for reactive delivery of new query results
- Optimistic updates are a client-side overlay, not a backend primitive.

## Open questions / assumptions

- Assumption: Convex’s caching + push model is the primary “reactivity engine”; details of delta delivery vs full-result push are not fully specified here.

