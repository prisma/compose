# Wrangler glossary (research)

This glossary is written from a DDD perspective: *terms*, *what they mean*, and *what operations exist on them*.

Source context: [Wrangler documentation](https://developers.cloudflare.com/workers/wrangler/)

## Core terms

### Configuration file

The authored manifest (`wrangler.toml` or `wrangler.jsonc`) that defines the Worker project. Cloudflare recommends treating it as the **source of truth** for configuring a Worker. Contains name, main entry, compatibility date, routes, bindings, environments, build settings, and more.

- **User-facing?** Yes.
- **Key operations**: author, validate (via schema), merge with environments, resolve for deploy/dev.

### Worker

The deployable unit: code (entrypoint + bundled modules) plus configuration (routes, bindings, limits) that runs on Cloudflare's edge network.

- **User-facing?** Yes.
- **Key operations**: init, develop (dev), deploy, delete, tail, versions, rollback.

### Main / entrypoint

The path to the Worker's executable entry (e.g. `./src/index.ts`). Required for Workers that handle fetch or scheduled events.

- **User-facing?** Yes (as `main` in config).
- **Key operations**: specify, resolve, bundle.

### Bindings

Platform resources that a Worker accesses at runtime via the `env` object (KV namespaces, R2 buckets, D1, Durable Objects, Queues, AI, Vectorize, services, etc.). Defined in the configuration file; each binding has a name and resource identifier.

- **User-facing?** Yes.
- **Key operations**: declare, provision (auto or manual), resolve (local vs remote in dev).

### Environment (env)

A named variant of configuration (e.g. `staging`, `production`). Top-level config is the default; named envs override inheritable keys and must re-declare non-inheritable keys (bindings, vars). Selected via `--env` / `-e` in commands.

- **User-facing?** Yes.
- **Key operations**: define, select, inherit, override.

### Compatibility date

A `yyyy-mm-dd` value that pins which Workers runtime version and features are used. Required for deployment.

- **User-facing?** Yes.
- **Key operations**: set, bump, validate.

### Route / workers.dev

How a Worker is exposed: custom domains, zone routes, or `*.workers.dev` subdomain.

- **User-facing?** Yes.
- **Key operations**: define pattern, attach zone, enable/disable `workers_dev`, configure custom domain.

### Bundle / build artifact

The compiled output of the Worker (entrypoint + dependencies) produced by esbuild (or a custom build). What actually gets uploaded to Cloudflare.

- **User-facing?** Indirectly (visible via `wrangler deploy --dry-run --outdir dist`).
- **Key operations**: bundle, minify, include modules (rules, find_additional_modules), emit for deploy.

### Local development (wrangler dev)

Running the Worker locally using Miniflare, which simulates the Workers runtime (`workerd`). Bindings default to local simulations; optional `remote: true` per binding connects to real Cloudflare resources.

- **User-facing?** Yes.
- **Key operations**: start, watch, hot-reload, switch local/remote bindings.

### Remote development (wrangler dev --remote)

Uploading code to a temporary preview environment on Cloudflare; all bindings use remote resources. Legacy mode; local + remote bindings is the recommended approach.

- **User-facing?** Yes.
- **Key operations**: start, upload-on-save.

### Preview / staging

Testing a version without affecting production. Includes: versioned preview URLs (auto per deploy), aliased preview URLs (human-readable alias), and environment-based config (e.g. `--env staging`).

- **User-facing?** Yes.
- **Key operations**: upload version, assign alias, access via `<<prefix>>-<<name>>.<<subdomain>>.workers.dev`.

## Internal-ish terms (helpful for modeling, not all are API)

### Miniflare

The local simulator that runs Worker code using the same runtime as production (`workerd`).

- **User-facing?** Not directly (wrapped by `wrangler dev` and Vite plugin).

### workerd

Cloudflare's Workers runtime (V8 isolates). Used both in production and by Miniflare locally.

- **User-facing?** No.

### Source of truth

The configuration file is the authoritative descriptor of the Worker; dashboard changes can be overwritten on next deploy unless `keep_vars` is set.

- **User-facing?** As documentation/convention, not as a named object.

### Inheritable vs non-inheritable keys

Config keys that either cascade into environments (e.g. `name`, `main`, `compatibility_date`) or must be specified per environment (e.g. `vars`, `kv_namespaces`, `r2_buckets`).

- **User-facing?** As behavior; users learn which keys "inherit" vs "don't."

## Open questions / assumptions

- Assumption: JSON Schema (`config-schema.json`) is used for config validation; exact error presentation style is not fully documented.
- Assumption: `wrangler check` validates the Worker without deploying; precise scope (config vs code vs both) may vary by version.
- Open: How does Wrangler communicate validation errors back to the author (file:line, actionable messages, schema-driven hints)?

# Wrangler glossary (research)

This glossary is written from a DDD perspective: *terms*, *what they mean*, and *what operations exist on them*.

Source context: [Wrangler documentation](https://developers.cloudflare.com/workers/wrangler/)

## Core terms

### Configuration file

The authored manifest (`wrangler.toml` or `wrangler.jsonc`) that defines the Worker project. Cloudflare recommends treating it as the **source of truth** for configuring a Worker. Contains name, main entry, compatibility date, routes, bindings, environments, build settings, and more.

- **User-facing?** Yes.
- **Key operations**: author, validate (via schema), merge with environments, resolve for deploy/dev.

### Worker

The deployable unit: code (entrypoint + bundled modules) plus configuration (routes, bindings, limits) that runs on Cloudflare’s edge network.

- **User-facing?** Yes.
- **Key operations**: init, develop (dev), deploy, delete, tail, versions, rollback.

### Main / entrypoint

The path to the Worker’s executable entry (e.g. `./src/index.ts`). Required for Workers that handle fetch or scheduled events.

- **User-facing?** Yes (as `main` in config).
- **Key operations**: specify, resolve, bundle.

### Bindings

Platform resources that a Worker accesses at runtime via the `env` object (KV namespaces, R2 buckets, D1, Durable Objects, Queues, AI, Vectorize, services, etc.). Defined in the configuration file; each binding has a name and resource identifier.

- **User-facing?** Yes.
- **Key operations**: declare, provision (auto or manual), resolve (local vs remote in dev).

### Environment (env)

A named variant of configuration (e.g. `staging`, `production`). Top-level config is the default; named envs override inheritable keys and must re-declare non-inheritable keys (bindings, vars). Selected via `--env` / `-e` in commands.

- **User-facing?** Yes.
- **Key operations**: define, select, inherit, override.

### Compatibility date

A `yyyy-mm-dd` value that pins which Workers runtime version and features are used. Required for deployment.

- **User-facing?** Yes.
- **Key operations**: set, bump, validate.

### Route / workers.dev

How a Worker is exposed: custom domains, zone routes, or `*.workers.dev` subdomain.

- **User-facing?** Yes.
- **Key operations**: define pattern, attach zone, enable/disable `workers_dev`, configure custom domain.

### Bundle / build artifact

The compiled output of the Worker (entrypoint + dependencies) produced by esbuild (or a custom build). What actually gets uploaded to Cloudflare.

- **User-facing?** Indirectly (visible via `wrangler deploy --dry-run --outdir dist`).
- **Key operations**: bundle, minify, include modules (rules, find_additional_modules), emit for deploy.

### Local development (wrangler dev)

Running the Worker locally using Miniflare, which simulates the Workers runtime (`workerd`). Bindings default to local simulations; optional `remote: true` per binding connects to real Cloudflare resources.

- **User-facing?** Yes.
- **Key operations**: start, watch, hot-reload, switch local/remote bindings.

### Remote development (wrangler dev --remote)

Uploading code to a temporary preview environment on Cloudflare; all bindings use remote resources. Legacy mode; local + remote bindings is the recommended approach.

- **User-facing?** Yes.
- **Key operations**: start, upload-on-save.

### Preview / staging

Testing a version without affecting production. Includes: versioned preview URLs (auto per deploy), aliased preview URLs (human-readable alias), and environment-based config (e.g. `--env staging`).

- **User-facing?** Yes.
- **Key operations**: upload version, assign alias, access via `<<prefix>>-<<name>>.<<subdomain>>.workers.dev`.

## Internal-ish terms (helpful for modeling, not all are API)

### Miniflare

The local simulator that runs Worker code using the same runtime as production (`workerd`).

- **User-facing?** Not directly (wrapped by `wrangler dev` and Vite plugin).

### workerd

Cloudflare’s Workers runtime (V8 isolates). Used both in production and by Miniflare locally.

- **User-facing?** No.

### Source of truth

The configuration file is the authoritative descriptor of the Worker; dashboard changes can be overwritten on next deploy unless `keep_vars` is set.

- **User-facing?** As documentation/convention, not as a named object.

### Inheritable vs non-inheritable keys

Config keys that either cascade into environments (e.g. `name`, `main`, `compatibility_date`) or must be specified per environment (e.g. `vars`, `kv_namespaces`, `r2_buckets`).

- **User-facing?** As behavior; users learn which keys “inherit” vs “don’t.”

## Open questions / assumptions

- Assumption: JSON Schema (`config-schema.json`) is used for config validation; exact error presentation style is not fully documented.
- Assumption: `wrangler check` validates the Worker without deploying; precise scope (config vs code vs both) may vary by version.
- Open: How does Wrangler communicate validation errors back to the author (file:line, actionable messages, schema-driven hints)?
