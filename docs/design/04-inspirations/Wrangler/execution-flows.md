# Wrangler execution flows (research)

This document captures the key execution flows that define the Wrangler interaction pattern — especially **local dev loop**, **config/validation**, **build**, **publish/deploy**, **preview/staging**, and **troubleshooting**.

Source context: [Wrangler documentation](https://developers.cloudflare.com/workers/wrangler/)

## Flow 1: Local dev loop

### 1) User runs `wrangler dev`

Wrangler loads config (with optional `--env`), resolves bindings, and starts Miniflare.

### 2) Bindings resolution

- Default: bindings connect to **local simulations** (KV, R2, D1, etc. simulated on disk).
- Per-binding `remote: true`: operations go to the real Cloudflare resource.
- AI, Browser Rendering, Vectorize, Images, mTLS: recommended/required to use `remote: true` (no local sim).

### 3) Watch and hot-reload

- Source changes trigger re-bundle (esbuild) and Worker restart.
- Custom build: `build.watch_dir` controls what is watched.

### 4) User requests hit local server

- Worker executes via workerd (same runtime as production).
- Same `env` API as in production; binding target (local vs remote) is transparent to code.

### 5) Optional: `wrangler dev --remote`

- Code is uploaded to a temporary preview on Cloudflare.
- All bindings use remote resources; no local simulation.
- Slower iteration; used when behavior depends on Cloudflare's network.

---

## Flow 2: Config / validation

### 1) Config load

- Wrangler reads `wrangler.toml` or `wrangler.jsonc` (or path via `--config`).
- `$schema` in JSON config enables editor validation.

### 2) Environment merge

- Top-level + `env.<name>` merged; `--env` selects target.
- Inheritable keys cascade; non-inheritable (bindings, vars) must be specified per env.

### 3) Validation

- `wrangler check`: validates Worker (config + code). Verified: command exists.
- Assumption: schema validation catches config shape errors; exact error format not fully documented.

### 4) Required keys

- Minimum: `name`, `main`, `compatibility_date` (or `main` optional for assets-only Workers).

---

## Flow 3: Build

### 1) Custom build (optional)

- If `build.command` is set, Wrangler runs it first (e.g. `npm run build`).
- `build.cwd`, `build.watch_dir` control execution context.

### 2) Default bundling

- esbuild bundles `main` and npm dependencies from `package.json`.
- Conditional exports: `workerd` key respected for isomorphic packages.

### 3) Additional modules

- `find_additional_modules: true` + `rules`: matches files (e.g. `.wasm`, `.mjs`) and includes them as unbundled modules.

### 4) Output

- Bundle + config produce the deployment artifact.
- `wrangler deploy --dry-run --outdir dist`: emit artifact to disk without deploying.

### 5) No-bundle mode

- `wrangler deploy --no-bundle`: use pre-built output as-is; no esbuild processing.

---

## Flow 4: Publish / deploy

### 1) Resolve config

- Merge top-level and env config; apply `--env` if specified.

### 2) Build

- Run custom build (if any), then bundle (unless `--no-bundle`).

### 3) Upload

- Artifact uploaded to Cloudflare; routes and bindings applied.
- Auto-provision (beta): missing resource IDs cause Wrangler to create resources and write IDs back to config.

### 4) Promote

- New version becomes the active deployment (or uses existing gradual deployment behavior).

### 5) Output

- URL(s) for the Worker (workers.dev, routes, or custom domain).

---

## Flow 5: Preview / staging

### 1) Environment-based staging

- `wrangler deploy -e staging`: deploy using `env.staging` config (different routes, bindings, vars).

### 2) Versioned preview URLs

- Each `wrangler deploy` or `wrangler versions upload` creates a version.
- Versioned URL: `<<version>>-<<worker>>.<<subdomain>>.workers.dev` (when `preview_urls` enabled).

### 3) Aliased preview URLs

- `wrangler versions upload --preview-alias staging`: assign a stable alias (e.g. `staging-<<worker>>.<<subdomain>>.workers.dev`).

### 4) Access control

- Cloudflare Access can gate preview URLs (auth required).

---

## Flow 6: Troubleshooting

### 1) Local inspection

- `wrangler deploy --dry-run --outdir dist`: inspect the artifact.
- `wrangler types`: generate types from bindings.

### 2) Remote logs

- `wrangler tail`: livestream logs from a deployed Worker.

### 3) Deployment history

- `wrangler versions`, `wrangler deployments`: list versions and deployments.
- `wrangler rollback`: revert to a previous deployment.

### 4) Resource inspection

- `wrangler d1 info|list`, `wrangler kv namespace list`, etc.: inspect provisioned resources.

---

## Open questions / assumptions

- Assumption: Flow ordering (config → build → deploy) is accurate; custom build integration details may vary.
- Assumption: `wrangler dev --remote` is legacy; local + remote bindings is the recommended path.
- Open: How does the Vite plugin alter these flows (e.g. Vite owns the build; Wrangler consumes output)?
- Open: What is the exact lifecycle of auto-provisioned resources (create on first deploy, write-back timing)?

# Wrangler execution flows (research)

This document captures the key execution flows that define the Wrangler interaction pattern — especially **local dev loop**, **config/validation**, **build**, **publish/deploy**, **preview/staging**, and **troubleshooting**.

Source context: [Wrangler documentation](https://developers.cloudflare.com/workers/wrangler/)

## Flow 1: Local dev loop

### 1) User runs `wrangler dev`

Wrangler loads config (with optional `--env`), resolves bindings, and starts Miniflare.

### 2) Bindings resolution

- Default: bindings connect to **local simulations** (KV, R2, D1, etc. simulated on disk).
- Per-binding `remote: true`: operations go to the real Cloudflare resource.
- AI, Browser Rendering, Vectorize, Images, mTLS: recommended/required to use `remote: true` (no local sim).

### 3) Watch and hot-reload

- Source changes trigger re-bundle (esbuild) and Worker restart.
- Custom build: `build.watch_dir` controls what is watched.

### 4) User requests hit local server

- Worker executes via workerd (same runtime as production).
- Same `env` API as in production; binding target (local vs remote) is transparent to code.

### 5) Optional: `wrangler dev --remote`

- Code is uploaded to a temporary preview on Cloudflare.
- All bindings use remote resources; no local simulation.
- Slower iteration; used when behavior depends on Cloudflare’s network.

---

## Flow 2: Config / validation

### 1) Config load

- Wrangler reads `wrangler.toml` or `wrangler.jsonc` (or path via `--config`).
- `$schema` in JSON config enables editor validation.

### 2) Environment merge

- Top-level + `env.<name>` merged; `--env` selects target.
- Inheritable keys cascade; non-inheritable (bindings, vars) must be specified per env.

### 3) Validation

- `wrangler check`: validates Worker (config + code). Verified: command exists.
- Assumption: schema validation catches config shape errors; exact error format not fully documented.

### 4) Required keys

- Minimum: `name`, `main`, `compatibility_date` (or `main` optional for assets-only Workers).

---

## Flow 3: Build

### 1) Custom build (optional)

- If `build.command` is set, Wrangler runs it first (e.g. `npm run build`).
- `build.cwd`, `build.watch_dir` control execution context.

### 2) Default bundling

- esbuild bundles `main` and npm dependencies from `package.json`.
- Conditional exports: `workerd` key respected for isomorphic packages.

### 3) Additional modules

- `find_additional_modules: true` + `rules`: matches files (e.g. `.wasm`, `.mjs`) and includes them as unbundled modules.

### 4) Output

- Bundle + config produce the deployment artifact.
- `wrangler deploy --dry-run --outdir dist`: emit artifact to disk without deploying.

### 5) No-bundle mode

- `wrangler deploy --no-bundle`: use pre-built output as-is; no esbuild processing.

---

## Flow 4: Publish / deploy

### 1) Resolve config

- Merge top-level and env config; apply `--env` if specified.

### 2) Build

- Run custom build (if any), then bundle (unless `--no-bundle`).

### 3) Upload

- Artifact uploaded to Cloudflare; routes and bindings applied.
- Auto-provision (beta): missing resource IDs cause Wrangler to create resources and write IDs back to config.

### 4) Promote

- New version becomes the active deployment (or uses existing gradual deployment behavior).

### 5) Output

- URL(s) for the Worker (workers.dev, routes, or custom domain).

---

## Flow 5: Preview / staging

### 1) Environment-based staging

- `wrangler deploy -e staging`: deploy using `env.staging` config (different routes, bindings, vars).

### 2) Versioned preview URLs

- Each `wrangler deploy` or `wrangler versions upload` creates a version.
- Versioned URL: `<<version>>-<<worker>>.<<subdomain>>.workers.dev` (when `preview_urls` enabled).

### 3) Aliased preview URLs

- `wrangler versions upload --preview-alias staging`: assign a stable alias (e.g. `staging-<<worker>>.<<subdomain>>.workers.dev`).

### 4) Access control

- Cloudflare Access can gate preview URLs (auth required).

---

## Flow 6: Troubleshooting

### 1) Local inspection

- `wrangler deploy --dry-run --outdir dist`: inspect the artifact.
- `wrangler types`: generate types from bindings.

### 2) Remote logs

- `wrangler tail`: livestream logs from a deployed Worker.

### 3) Deployment history

- `wrangler versions`, `wrangler deployments`: list versions and deployments.
- `wrangler rollback`: revert to a previous deployment.

### 4) Resource inspection

- `wrangler d1 info|list`, `wrangler kv namespace list`, etc.: inspect provisioned resources.

---

## Open questions / assumptions

- Assumption: Flow ordering (config → build → deploy) is accurate; custom build integration details may vary.
- Assumption: `wrangler dev --remote` is legacy; local + remote bindings is the recommended path.
- Open: How does the Vite plugin alter these flows (e.g. Vite owns the build; Wrangler consumes output)?
- Open: What is the exact lifecycle of auto-provisioned resources (create on first deploy, write-back timing)?
