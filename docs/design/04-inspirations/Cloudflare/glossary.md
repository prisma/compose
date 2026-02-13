# Cloudflare platform glossary (research)

This glossary is written from a DDD perspective: *terms*, *what they mean*, and *what operations exist on them*.

Source context: [Cloudflare Workers Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

## Core terms

### Worker

A unit of serverless compute that runs at the edge (or regionally). It receives events (HTTP fetch, cron triggers, queue messages, etc.) and executes user code.

- **User-facing?** Yes. Users author Workers and deploy them.
- **synonyms**: script, service
- **Key operations**: author, build, deploy, invoke (via ingress or triggers)

### Binding

A capability granted to a Worker that connects it to a platform resource. Bindings appear on the `env` object at runtime. They combine permission and API surface; credentials are never exposed to user code.

- **User-facing?** Yes. Users declare bindings in config and use them as `env.BINDING_NAME`.
- **synonyms**: env binding, resource binding
- **Key operations**: declare (in wrangler config), access at runtime via `env`, override for testing (`withEnv`)

### env (environment object)

The object passed to entrypoint handlers (e.g. `fetch(request, env)`) containing all bindings for that Worker. Keys are binding names; values are the runtime API for the bound resource.

- **User-facing?** Yes (as the primary runtime interface for dependencies).
- **synonyms**: bindings object, execution context
- **Key operations**: receive in handler, access bindings, optionally import from `cloudflare:workers` for top-level scope (with I/O restrictions)

### Wrangler configuration

The manifest file (`wrangler.toml` or `wrangler.jsonc`) that defines a Worker project: entry point, bindings, routes, cron triggers, environments.

- **User-facing?** Yes.
- **synonyms**: wrangler.toml, wrangler.jsonc, config
- **Key operations**: author, validate, reference from CLI via `--config`

### Entry point (main)

The module path and export that the Worker runtime loads to handle incoming events (e.g. `fetch` for HTTP).

- **User-facing?** Yes (as `main` in wrangler config).
- **synonyms**: main, handler module
- **Key operations**: configure, bundle, load at runtime

### Route

A rule that maps HTTP traffic (pattern on host/path) to a Worker. Routes are configured in wrangler config or the dashboard.

- **User-facing?** Yes.
- **synonyms**: route pattern, ingress rule
- **Key operations**: declare, deploy, match incoming requests

### Cron trigger

A schedule that invokes a Worker on a fixed interval (cron expression).

- **User-facing?** Yes.
- **synonyms**: cron schedule
- **Key operations**: declare in config, trigger at scheduled times

## Binding types (selected)

### Resource bindings (platform-provisioned)

- **KV namespace**: key-value store; binding exposes `get`, `put`, `list`, `delete`.
- **R2 bucket**: object storage; binding exposes `get`, `put`, `delete`, `list`.
- **D1 database**: SQLite; binding exposes `prepare`, `batch`, etc.
- **Durable Object**: stateful, single-tenant object; binding exposes stub to `get()` the object.
- **Queue**: message queue; binding exposes `send` (producer) or is configured as consumer.
- **Service binding**: call another Worker; binding is an RPC-like stub.
- **Environment variable / Secret**: scalar value; binding exposes the value (secret is not logged).

## Internal-ish terms (helpful for modeling, not all are API)

### Isolate

The V8 isolate in which a Worker runs. Multiple requests may share an isolate; binding-only changes may reuse isolates without reloading code.

- **User-facing?** No (observable implicitly via cold-start vs warm behavior).

### Control plane (Wrangler / dashboard)

The tooling and APIs used to configure, build, deploy, and manage Workers and resources. Operates on descriptors (config) and artifacts (bundles).

- **User-facing?** Yes (as the developer workflow).

### Artifact (bundle)

The compiled/bundled JavaScript (or WASM) that gets deployed. Produced by Wrangler at build time.

- **User-facing?** Indirectly (users see `dist/` output; platform consumes the upload).

---

## Open questions / assumptions

- **Assumption**: Wrangler’s `--experimental-provision` and `--experimental-auto-create` represent an evolving story for binding provisioning; we treat config-driven binding declaration as the stable model.
- **Open question**: How does Cloudflare version and roll back deployments at the platform level (versions vs deployments vs rollback)?

