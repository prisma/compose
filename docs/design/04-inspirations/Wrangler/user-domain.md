# Wrangler user domain map (research)

This doc focuses on the **user's mental model**: what concepts they name, configure, and rely on day-to-day — and how that maps to internal mechanics.

Source context: [Wrangler documentation](https://developers.cloudflare.com/workers/wrangler/)

## The user's ubiquitous language (what they "think in")

- **Config file**: "where I define my Worker and its bindings"
- **Worker**: "my app that runs on the edge"
- **Binding**: "how my Worker talks to KV, R2, D1, etc."
- **Environment**: "staging vs production (different routes, bindings, vars)"
- **Dev**: "run it locally, see changes instantly"
- **Deploy**: "ship it to Cloudflare"

### The key user promise

The recurring flow is:

1. **Author config** (name, main, compatibility_date, bindings, routes).
2. **Write code** (entrypoint + imports).
3. **Dev locally** — same API, local or mixed remote bindings.
4. **Deploy** — same artifact model as dev.

That "config-as-source-of-truth + local-prod parity" is the core behavioral pattern.

## User concepts vs internal mechanics (mapping)

| User concept | What it feels like | Internal-ish mechanism it implies |
|---|---|---|
| Config file | "Single place I define everything" | Schema validation, env merging, resolution for deploy/dev |
| Worker | "My deployable unit" | Bundle (esbuild/custom) + config = artifact |
| Binding | "My Worker's connection to a resource" | Binding resolution: local sim vs remote proxy in dev |
| Environment | "Staging vs prod" | Inheritable vs non-inheritable keys; `--env` selection |
| Dev | "Fast loop, same API as prod" | Miniflare + workerd; optional remote bindings |
| Deploy | "Ship to Cloudflare" | Upload artifact, apply routes, bindings, limits |
| Preview | "Test before production" | Versioned/aliased URLs; env-specific deploy |

## Artifact boundary (user-visible)

The user doesn't usually touch the bundle directly, but they can:

- Run `wrangler deploy --dry-run --outdir dist` to inspect what gets uploaded.
- Use `wrangler deploy --no-bundle` when they own the build.

So the **artifact boundary** is explicit: "this is what runs." Config + code → artifact → deploy.

## Validation UX

- Config: JSON Schema (`$schema`) provides editor support; `wrangler check` validates the Worker.
- Assumption: errors are tied to config/code locations; exact messaging style is not fully documented in public sources.

## Local-prod parity

- Same config, same code path for dev and deploy.
- Bindings: local simulations by default; `remote: true` per binding for live resources in dev.
- Limits (e.g. `cpu_ms`) are enforced only when deployed, not locally.

## Open questions / assumptions

- Assumption: Users primarily interact via CLI; programmatic API exists but is secondary.
- Open: How do Vite-plugin users experience the same mental model when `wrangler dev` is replaced by `vite dev`?
- Open: What validation error formats (file:line, codes, suggestions) does Wrangler actually produce in practice?

# Wrangler user domain map (research)

This doc focuses on the **user’s mental model**: what concepts they name, configure, and rely on day-to-day — and how that maps to internal mechanics.

Source context: [Wrangler documentation](https://developers.cloudflare.com/workers/wrangler/)

## The user’s ubiquitous language (what they “think in”)

- **Config file**: “where I define my Worker and its bindings”
- **Worker**: “my app that runs on the edge”
- **Binding**: “how my Worker talks to KV, R2, D1, etc.”
- **Environment**: “staging vs production (different routes, bindings, vars)”
- **Dev**: “run it locally, see changes instantly”
- **Deploy**: “ship it to Cloudflare”

### The key user promise

The recurring flow is:

1. **Author config** (name, main, compatibility_date, bindings, routes).
2. **Write code** (entrypoint + imports).
3. **Dev locally** — same API, local or mixed remote bindings.
4. **Deploy** — same artifact model as dev.

That “config-as-source-of-truth + local-prod parity” is the core behavioral pattern.

## User concepts vs internal mechanics (mapping)

| User concept | What it feels like | Internal-ish mechanism it implies |
|---|---|---|
| Config file | “Single place I define everything” | Schema validation, env merging, resolution for deploy/dev |
| Worker | “My deployable unit” | Bundle (esbuild/custom) + config = artifact |
| Binding | “My Worker’s connection to a resource” | Binding resolution: local sim vs remote proxy in dev |
| Environment | “Staging vs prod” | Inheritable vs non-inheritable keys; `--env` selection |
| Dev | “Fast loop, same API as prod” | Miniflare + workerd; optional remote bindings |
| Deploy | “Ship to Cloudflare” | Upload artifact, apply routes, bindings, limits |
| Preview | “Test before production” | Versioned/aliased URLs; env-specific deploy |

## Artifact boundary (user-visible)

The user doesn’t usually touch the bundle directly, but they can:

- Run `wrangler deploy --dry-run --outdir dist` to inspect what gets uploaded.
- Use `wrangler deploy --no-bundle` when they own the build.

So the **artifact boundary** is explicit: “this is what runs.” Config + code → artifact → deploy.

## Validation UX

- Config: JSON Schema (`$schema`) provides editor support; `wrangler check` validates the Worker.
- Assumption: errors are tied to config/code locations; exact messaging style is not fully documented in public sources.

## Local-prod parity

- Same config, same code path for dev and deploy.
- Bindings: local simulations by default; `remote: true` per binding for live resources in dev.
- Limits (e.g. `cpu_ms`) are enforced only when deployed, not locally.

## Open questions / assumptions

- Assumption: Users primarily interact via CLI; programmatic API exists but is secondary.
- Open: How do Vite-plugin users experience the same mental model when `wrangler dev` is replaced by `vite dev`?
- Open: What validation error formats (file:line, codes, suggestions) does Wrangler actually produce in practice?
