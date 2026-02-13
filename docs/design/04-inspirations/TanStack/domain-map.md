# TanStack DB domain map (research)

This is a conceptual map of the TanStack DB domain: the *things* that exist and how they relate.

Source context: [TanStack DB Overview](https://tanstack.com/db/latest/docs/overview)

```mermaid
flowchart LR
  subgraph User_Surface[User-facing surface]
    C[Collection]
    S[Collection Schema]
    Q[Query]
    LQ[Live Query]
    M[Mutation\n(insert/update/delete)]
    T[Transaction / Optimistic Action]
    SM[Sync Mode\n(eager/on-demand/progressive)]
  end

  subgraph Runtime[Runtime / mechanics]
    LQE[Local Query Engine]
    OO[Optimistic Overlay]
    PH[Persistence Handlers\n(onInsert/onUpdate/onDelete)]
    SS[Sync Source\n(fetch/sync/local)]
    LSO[Load Subset Options\n(predicate->request)]
  end

  S --> C
  SM --> C
  SS --> C

  Q --> LQ
  LQ --> LQE
  C --> LQE

  M --> OO
  T --> M
  OO --> LQE

  M --> PH

  Q -. used as contract for subset loading .-> LSO
  LSO --> SS
  SS --> C
```

## Notes

- The user mostly thinks in: **collections**, **queries**, **live queries**, and **mutations**.
- The runtime makes this work by combining:
  - a **local query engine** that can update results reactively
  - an **optimistic overlay** that updates immediately, then reconciles after persistence
  - configurable **sync modes** that determine *what gets loaded when*

