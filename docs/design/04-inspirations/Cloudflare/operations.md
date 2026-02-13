# Cloudflare platform operations (research)

This document enumerates the "verbs" (operations) on the core domain concepts, as implied by the Cloudflare Workers model.

Source context: [Cloudflare Workers Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/), [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/)

## Operations on Workers

- **Author a Worker**
  - Write handler code (fetch, scheduled, queue consumer); export from entry point.
- **Configure a Worker**
  - Set `main`, bindings, routes, cron, environments in wrangler config.
- **Build/validate**
  - Run `wrangler deploy` (builds implicitly) or `wrangler check` to validate without deploying.
- **Deploy a Worker**
  - Upload artifact + metadata; platform provisions bindings and attaches routes.
- **Run locally**
  - `wrangler dev`: local server with emulated bindings (local D1, local KV, etc.).
- **Delete a Worker**
  - `wrangler delete`: removes the Worker from the account.
- **Observe**
  - `wrangler tail`: livestream logs from deployed Worker.
  - Dashboard: metrics, errors, invocations.

## Operations on bindings

- **Declare a binding**
  - Add binding block to wrangler config (e.g. `[[r2_buckets]]`, `[[d1_databases]]`).
- **Provision a resource** (when required)
  - Use Wrangler subcommands (`wrangler d1 create`, `wrangler kv namespace create`) or dashboard.
- **Access a binding at runtime**
  - Read from `env.BINDING_NAME` inside handler.
- **Override for testing**
  - Use `withEnv()` (or `patch_env` in Python) to override values in tests.
- **Manage secrets**
  - `wrangler secret put`: set secret values (not in config file).

## Operations on routes / ingress

- **Declare a route**
  - Add `routes` or `route` in wrangler config, or configure in dashboard.
- **Attach a custom domain**
  - Configure in dashboard or via API.
- **Preview**
  - Use `*.workers.dev` subdomain or preview URLs.

## Operations on cron triggers

- **Declare a cron**
  - Add `[triggers]` / `crons` in wrangler config.
- **Execute**
  - Platform invokes Worker at scheduled times (no HTTP request; cron payload).

## Lifecycle operations (versions / deployments)

- **Deploy**
  - Creates a new version; becomes active for routes.
- **Rollback**
  - `wrangler rollback`: revert to a previous deployment.
- **List versions/deployments**
  - `wrangler versions`, `wrangler deployments`: inspect history.

---

## Open questions / assumptions

- **Assumption**: Binding-only deploys may reuse isolates (no code reload); we treat this as an optimization, not a guaranteed contract.
- **Open question**: Exact behavior of `wrangler dev --remote` vs local emulation for each binding type.

