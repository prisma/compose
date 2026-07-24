`next dev` wired to them. Sign up, open **Dev inbox**, follow the verification
link, then sign in — or use the magic link. No credentials, no config.

### The idiomatic pipeline path (`prisma-composer dev`)

`pnpm dev:pipeline` runs the real ADR-0041 local-dev pipeline
(`prisma-composer dev module.ts`) against local providers, sourcing
[.env.dev](.env.dev) for the operator params the deploy pipeline validates. It
**converges fully** — compute + Postgres emulators, the Next `api`, `auth`,
`email`, and the generated auth secret all stand up, credential-free — but the
app does not yet run end to end. Three local-dev gaps remain (deploy-only
features not wired into `prisma-composer dev`); until they land, `pnpm dev`
(above) is the wired one-command path. The gaps, in order hit:

1. **No sibling-origin binding.** The auth `baseUrl`/`trustedOrigins` must equal
   the `api` service's public origin. Deploy supplies it as the known api domain
   via `AUTH_BASE_URL`; `prisma-composer dev` assigns the api a dynamic,
   unpinnable port (the compute emulator's `get-port`, and api is created last),
   so the operator can't pre-set `AUTH_BASE_URL`. Mismatch → sign-up is rejected
   `403 INVALID_ORIGIN`. There is no param source for "another service's resolved
   origin" (only `envParam`/`generatedParam`).
2. **Auth pack schema not applied.** With the origin matched, sign-up then fails
   `500`: the auth service errors `relation "user" does not exist` (`42P01`). The
   auth pack's tables are absent from the emulator Postgres — the migration
   resource reports `noop`, so local-dev doesn't apply the extension pack's
   schema the way deploy does.
3. **Email service crash-loops.** The `email` service crash-loops against the
   emulator Postgres on `prepared statement "…emails$0" already exists`
   (`42P05`) and is held after repeated fast exits — its outbox-table init
   re-prepares a named statement the emulator connection already holds.

## Deploy

```sh
pnpm deploy    # needs .env at the repo root (see the deploy scripts)
pnpm destroy
```
