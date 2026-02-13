# Wrangler domain map (research)

This is a conceptual map of the Wrangler domain: the *things* that exist and how they relate.

Source context: [Wrangler documentation](https://developers.cloudflare.com/workers/wrangler/)

```mermaid
flowchart TB
  subgraph Authoring[Authoring / source]
    CFG[Configuration file\nwrangler.toml | wrangler.jsonc]
    MAIN[Main entrypoint]
    CODE[Source code]
  end

  subgraph CLI[CLI command surface]
    INIT[init]
    DEV[dev]
    DEPLOY[deploy]
    CHECK[check]
    DELETE[delete]
    TAIL[tail]
    RESOURCE[d1 | kv | r2 | ...]
  end

  subgraph ConfigResolved[Resolved configuration]
    ENV[Environment\n--env staging etc]
    ROUTES[Routes / workers_dev]
    BINDINGS[Bindings\nKV, R2, D1, DO, ...]
  end

  subgraph Build[Build / bundle]
    BUNDLE[Bundle\nesbuild / custom build]
    ARTIFACT[Deployment artifact]
  end

  subgraph Runtime[Runtime targets]
    LOCAL[Local\nMiniflare / workerd]
    REMOTE[Remote\nCloudflare edge]
    PREVIEW[Preview\nversioned | aliased URLs]
  end

  CFG --> MAIN
  CFG --> ROUTES
  CFG --> BINDINGS
  CFG --> ENV

  INIT --> CFG
  CHECK --> CFG
  CHECK --> CODE
  DEV --> CFG
  DEV --> BUNDLE
  DEV --> LOCAL
  DEPLOY --> CFG
  DEPLOY --> BUNDLE
  DEPLOY --> REMOTE

  MAIN --> CODE
  CODE --> BUNDLE
  BUNDLE --> ARTIFACT

  ARTIFACT --> LOCAL
  ARTIFACT --> REMOTE
  ARTIFACT --> PREVIEW

  BINDINGS -.->|local simulation| LOCAL
  BINDINGS -.->|remote: true| REMOTE

  subgraph ArtifactBoundary[Artifact boundary]
    ARTIFACT
  end
```

## Notes

- The user mostly thinks in: **configuration file**, **Worker** (name + entry + bindings), **environments**, and **commands** (dev, deploy, tail, resource management).
- The CLI surface is the primary interaction model; config is the source of truth.
- **Artifact boundary**: the bundle/artifact is the deployment unit; config + code produce it.
- Local vs remote dev is a binding-resolution concern: same artifact, different binding targets (simulated vs live).
- Preview/staging spans: env-specific config, versioned preview URLs, and optional aliased URLs.

## Open questions / assumptions

- Assumption: The Mermaid diagram reflects documented behavior; some edge cases (e.g. Vite plugin vs raw Wrangler) may diverge.
- Open: How does the artifact boundary interact with Workers Sites / Pages / Assets in multi-asset projects?
- Open: What is the full set of "top-level only" vs "inheritable" vs "non-inheritable" keys and how do they affect the domain model?

# Wrangler domain map (research)

This is a conceptual map of the Wrangler domain: the *things* that exist and how they relate.

Source context: [Wrangler documentation](https://developers.cloudflare.com/workers/wrangler/)

```mermaid
flowchart TB
  subgraph Authoring[Authoring / source]
    CFG[Configuration file\nwrangler.toml | wrangler.jsonc]
    MAIN[Main entrypoint]
    CODE[Source code]
  end

  subgraph CLI[CLI command surface]
    INIT[init]
    DEV[dev]
    DEPLOY[deploy]
    CHECK[check]
    DELETE[delete]
    TAIL[tail]
    RESOURCE[d1 | kv | r2 | ...]
  end

  subgraph ConfigResolved[Resolved configuration]
    ENV[Environment\n--env staging etc]
    ROUTES[Routes / workers_dev]
    BINDINGS[Bindings\nKV, R2, D1, DO, ...]
  end

  subgraph Build[Build / bundle]
    BUNDLE[Bundle\nesbuild / custom build]
    ARTIFACT[Deployment artifact]
  end

  subgraph Runtime[Runtime targets]
    LOCAL[Local\nMiniflare / workerd]
    REMOTE[Remote\nCloudflare edge]
    PREVIEW[Preview\nversioned | aliased URLs]
  end

  CFG --> MAIN
  CFG --> ROUTES
  CFG --> BINDINGS
  CFG --> ENV

  INIT --> CFG
  CHECK --> CFG
  CHECK --> CODE
  DEV --> CFG
  DEV --> BUNDLE
  DEV --> LOCAL
  DEPLOY --> CFG
  DEPLOY --> BUNDLE
  DEPLOY --> REMOTE

  MAIN --> CODE
  CODE --> BUNDLE
  BUNDLE --> ARTIFACT

  ARTIFACT --> LOCAL
  ARTIFACT --> REMOTE
  ARTIFACT --> PREVIEW

  BINDINGS -.->|local simulation| LOCAL
  BINDINGS -.->|remote: true| REMOTE

  subgraph ArtifactBoundary[Artifact boundary]
    ARTIFACT
  end
```

## Notes

- The user mostly thinks in: **configuration file**, **Worker** (name + entry + bindings), **environments**, and **commands** (dev, deploy, tail, resource management).
- The CLI surface is the primary interaction model; config is the source of truth.
- **Artifact boundary**: the bundle/artifact is the deployment unit; config + code produce it.
- Local vs remote dev is a binding-resolution concern: same artifact, different binding targets (simulated vs live).
- Preview/staging spans: env-specific config, versioned preview URLs, and optional aliased URLs.

## Open questions / assumptions

- Assumption: The Mermaid diagram reflects documented behavior; some edge cases (e.g. Vite plugin vs raw Wrangler) may diverge.
- Open: How does the artifact boundary interact with Workers Sites / Pages / Assets in multi-asset projects?
- Open: What is the full set of “top-level only” vs “inheritable” vs “non-inheritable” keys and how do they affect the domain model?
