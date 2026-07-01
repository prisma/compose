# Gotchas

A running log of surprises, workarounds, and undocumented behaviour hit while
_consuming_ **Prisma Next**, **Prisma Compute**, or **Prisma Postgres** in this
project. Each entry captures friction a real user of these products would also hit.

Each entry is also filed as a Triage-state Linear ticket in the matching gotchas
project so the team can pick it up:

- Prisma Next → [`pn-gotchas`](https://linear.app/prisma-company/project/pn-gotchas-a6f6f5157a5c/overview)
- Prisma Compute → [`compute-gotchas`](https://linear.app/prisma-company/project/compute-gotchas-dd3ac34b5ad4/overview)
- Prisma Postgres → [`ppg-gotchas`](https://linear.app/prisma-company/project/ppg-gotchas-afe77336f696/overview)

The capture workflow is the Ignite `product-record-gotcha` skill.

---

## Contents

- [compute-services create returns a placeholder-region serviceEndpointDomain that 404s until a version is promoted](#compute-services-create-returns-a-placeholder-region-serviceendpointdomain-that-404s-until-a-version-is-promoted)
- [app build --build-type nextjs yields a boot-crashing standalone for pnpm projects](#app-build---build-type-nextjs-yields-a-boot-crashing-standalone-for-pnpm-projects)

---

## compute-services create returns a placeholder-region serviceEndpointDomain that 404s until a version is promoted

**Filed upstream:** [PRO-200](https://linear.app/prisma-company/issue/PRO-200/compute-services-create-returns-a-placeholder-region) — _"compute-services create returns a placeholder-region serviceEndpointDomain that 404s until a version is promoted"_
**Product:** Prisma Compute
**Version:** `@prisma/management-api-sdk` 1.47.0 · Management API `https://api.prisma.io/v1`
**First hit:** `examples/smoke` — proving the v2 Alchemy Compute provider end-to-end against real Prisma Cloud
**Cost:** ~1 hour — three all-green deploys that each 404'd on a dead URL before we queried the version directly

**Symptom.** `POST /v1/projects/{projectId}/compute-services` (with `regionId: us-east-1`) returns a `serviceEndpointDomain` on the `.cdg.` region subdomain. Curling it returns a permanent, plain-text `404 Not Found` from the edge — while the deploy sequence is all green and `GET /v1/compute-services/versions/{id}` reports `status: "running"`, correct `portMapping.http`, and injected env vars. Nothing signals the URL is wrong.

**Cause.** The create-time `serviceEndpointDomain` is a placeholder region that does not serve. The real serving domain resolves only after a version is promoted and running, on a _different_ region subdomain matching the service's region:

- create response: `https://cmr26hp1d2c7q0vf8ji978s7k.cdg.prisma.build` → 404
- `GET /v1/compute-services/{id}` after promote: `https://cmr26hp1d2c7q0vf8ji978s7k.ewr.prisma.build` → 200

Same service id (created explicitly in `us-east-1`), different region subdomain (`.cdg.` vs `.ewr.`).

**Workaround.** Ignore the create response's `serviceEndpointDomain`. After promote, re-`GET /v1/compute-services/{id}` and use _that_ `serviceEndpointDomain`. Our Alchemy provider's `Deployment` re-reads the service post-promote and returns it as `deployedUrl`.

**Reproduction.**

1. Create a compute service with `regionId: us-east-1`; note `serviceEndpointDomain` (`.cdg.`).
2. Create a version → PUT the tar.gz to `uploadUrl` → start → poll until `running` → promote.
3. `curl` the create-time domain → `404 Not Found`, permanently.
4. `GET /v1/compute-services/{id}` → a different `serviceEndpointDomain` (`.ewr.`); `curl` that → `200`.

**References.**

- Upstream: [PRO-200](https://linear.app/prisma-company/issue/PRO-200/compute-services-create-returns-a-placeholder-region)
- Workaround source: [`packages/prisma-alchemy/src/compute/Deployment.ts`](packages/prisma-alchemy/src/compute/Deployment.ts)
- Related: [`.drive/projects/mvp-example-app/design-notes.md`](.drive/projects/mvp-example-app/design-notes.md) — "Validated end-to-end (Compute)"

---

## app build --build-type nextjs yields a boot-crashing standalone for pnpm projects

**Filed upstream:** [PRO-201](https://linear.app/prisma-company/issue/PRO-201/app-build-build-type-nextjs-yields-a-boot-crashing-standalone-for-pnpm) — _"app build --build-type nextjs yields a boot-crashing standalone for pnpm projects"_
**Product:** Prisma Compute
**Version:** `@prisma/cli` app build (via `bunx @prisma/cli@latest`); Next.js 15.5.19; pnpm 10.27.0; bun 1.3.13
**First hit:** `examples/storefront-auth/hexes/storefront` — deploying the Next.js Storefront hex to Compute
**Cost:** ~1 hour of iteration before landing the hoisted + direct-`next build` approach

**Symptom.** The deployed Next.js standalone crashes at boot with `Cannot find module 'styled-jsx/package.json'` (from `next/dist/server/require-hook.js`). The compute version reports `status: running`, but the endpoint serves a 404 "There is no service on this URL". Fails identically under `bun` and `node`.

**Cause.** Next `output: "standalone"` copies `next` as a flat dir into the app's node_modules and resolves peers (styled-jsx) relative to it. pnpm's default isolated layout keeps those peers under `.pnpm/`, unreachable from the flattened copy. `@prisma/cli app build --build-type nextjs` produces exactly this crashing artifact. Switching to a flat layout (`.npmrc` `node-linker=hoisted`) fixes the standalone — but then `app build` can't run, because under hoisted there is no per-package node_modules for its spawned `next build` to resolve `next` from. No single config makes `app build` work for a pnpm Next app.

**Workaround.** `.npmrc` `node-linker=hoisted`, run `next build` directly (not `app build`), and package the standalone yourself: copy `.next/static` + `public` into the standalone tree, write the compute manifest pointing at the standalone `server.js`, tar it.

**Reproduction.**

1. pnpm workspace with a Next.js app, `output: "standalone"`.
2. `bunx @prisma/cli@latest app build --build-type nextjs` (default isolated pnpm).
3. Run the artifact (`bun server.js`) → crashes: `Cannot find module 'styled-jsx/package.json'`.
4. Add `.npmrc` `node-linker=hoisted`, clean reinstall, retry `app build` → fails: can't resolve the `next` bin.

**References.**

- Upstream: [PRO-201](https://linear.app/prisma-company/issue/PRO-201/app-build-build-type-nextjs-yields-a-boot-crashing-standalone-for-pnpm)
- Workaround source: [`examples/storefront-auth/scripts/bundle-next.ts`](examples/storefront-auth/scripts/bundle-next.ts), [`.npmrc`](.npmrc)
- Related: [`.drive/projects/mvp-example-app/design-notes.md`](.drive/projects/mvp-example-app/design-notes.md) — "Compute skill findings"
