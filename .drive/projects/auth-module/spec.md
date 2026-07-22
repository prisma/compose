# Project: `auth` module — design proposal

> Status: **proposed, awaiting review** (2026-07-22). Nothing below is settled
> until Will signs off. The contract sketch is a sketch — names and shapes are
> up for argument; the decisions table records a recommendation per open
> question, with the reasoning inline.

## At a glance

Signup, login, sessions, and JWT verification as a composed module, wrapping
**Better Auth** (TypeScript library, in-process, owns Postgres tables). The
module is the dedicated-service shape: one Compute service, its own tables,
four consumer surfaces:

1. **`api`** — Better Auth's public HTTP surface (`/sign-in/email`,
   `/magic-link/verify`, `/jwks`, …), the thing browsers talk to. Exposed as
   an `http`-kind port; the golden path is the consumer app proxying
   `/api/auth/*` to it so cookies stay same-origin.
2. **`jwtVerifier()`** — a dependency factory whose hydrated binding verifies
   JWTs **statelessly** against the auth service's JWKS (fetched once,
   cached). No DB access, no per-request network call.
3. **`session`** — a service-rpc port for what stateless JWTs can't cover:
   online session check (instant logout) and user lookup.
4. **`admin`** — a second, least-privilege service-rpc port carrying typed
   admin operations (list users, revoke sessions, ban). Tier-1 of the admin
   path, following the conventions the email module's `outbox` port set.

Email delivery (verification, password reset, magic links) is **not built
here** — the module declares an `email` boundary dependency and ships its own
`defineTemplates(...)` set against PR #146's contract. Auth + email is the
first module-depends-on-module proof.

## What the research established (inputs, not proposals)

- **ADR-0016 rules out module-as-embedded-library.** A module *is* a service
  boundary ("not a library you embed in your process"). So "mounted-in-app"
  cannot be a module mode — it becomes a plain library export (see D13).
- **ADR-0030/0031 already solved platform-minted keys.** Streams' bearer key
  is a provisioning need (`Symbol.for('prisma:streams/api-key')`), minted
  deploy-side as a `Prisma.ServiceKey` kept in hosted deploy state, delivered
  through a reserved provider param. Stable across deploys. That is the rail
  the Better Auth instance secret wants (D8).
- **PR #146's contract needs nothing added for auth.** Templates are declared
  consumer-side; auth registers its own `verification` / `passwordReset` /
  `magicLink` templates and depends via `emailSender(templates)`. Two review
  findings on #146 transfer as obligations here: reuse one idempotency key
  across a retried send (the auto-minted key defeats dedup otherwise), and
  validate + HTML-escape links before interpolating them into templates.
- **The cross-boundary FK mechanism exists and is generic.** Prisma Next's
  contract spaces (prisma-next ADR 226): an extension pack with `id: 'auth'`
  shipping a contract whose tables are `control: 'external'` makes
  `auth:User` a resolvable type ref; the consumer gets a **real FK
  constraint** while migrations never emit DDL for the referenced table.
  But an FK is only possible inside **one physical database**, and Composer's
  ADR-0022 currently allows one Prisma Next contract per database —
  multi-contract is "deferred, not rejected". That deferral is the only thing
  standing between this module and the FK story (D3/D4).
- **Better Auth facts** (v1.x): JWT plugin stores signing keypairs in a
  `jwks` table (private key AES-GCM-encrypted with the instance secret),
  serves a JWKS endpoint, default EdDSA/Ed25519, 15-minute tokens; consumers
  verify with `jose` against the JWKS — no shared signing secret ever leaves
  the auth service. Magic link, email verification, and password reset each
  take a send callback receiving `{ user/email, url, token }` — exactly the
  seam the email dependency plugs into. The admin plugin provides server-side
  user/session management calls the `admin` port wraps.

## Decisions proposed

| # | Decision | Why |
|---|---|---|
| D1 | Dedicated Compute service wrapping Better Auth; module owns its tables | The module shape (ADR-0016); Better Auth is a library, so *some* service must host it — ours does |
| D2 | The database is a **boundary dependency** (`db: postgres()`), never self-provisioned | Streams precedent (`store: s3()`). One module shape serves both topologies: wire a dedicated `provision(postgres(...))` for isolation, or wire the app's own database to enable real FKs later. Costs one line at the root; avoids a breaking shape change when the FK milestone lands |
| D3 | Cross-boundary user reference = Prisma Next contract space: the auth package ships an extension pack (`auth:` space) whose contract declares the user table `control: 'external'` | The strategy doc's instruction ("reuse that mechanism, don't invent one"); it already does exactly this for `supabase:auth.AuthUser` |
| D4 | v1 ships **plain-id reference** (consumer stores `userId` as a validated string/uuid column, no DB constraint); the FK mode is milestone 2, blocked on ADR-0022's multi-contract-per-database slice | An FK needs consumer tables and auth tables in one database with two contracts (consumer's + the auth pack's external one). That is precisely the deferred ADR-0022 extension; this module is its forcing function, not the place to smuggle it in |
| D5 | Session strategy: **stateless JWT by default** (15-min TTL, JWKS-verified), revocation as an explicit opt-in per call site via the `session` port | "No DB access" is the whole value of the JWT binding; instant logout is real but is a per-route decision, not a global one. `verify()` stays pure; `session.getSession()` is the online check |
| D6 | Plugins surfaced in v1: email+password (core), email verification, magic link, JWT + JWKS, bearer, admin. Internal only: rate limiting, openAPI (dev). Explicitly out: organizations, 2FA, passkeys, username, phone — contract must not preclude them | Zero-click-ops golden path needs exactly the first set; each additional plugin is contract surface a backing swap must preserve |
| D7 | Social OAuth is opt-in via factory options: `auth({ social: { github: true } })` adds per-provider secret slots (`githubClientSecret: secret()`) and params (`githubClientId`) to the module's declared needs | ADR-0029 has no optional secrets — slots must exist only when the provider is enabled, so the factory's option shape drives the declared needs map (same trick as `emailSender`'s generic template map) |
| D8 | The Better Auth **instance secret** (cookie signing + jwks private-key encryption) is **platform-minted**: an ADR-0031 provisioning need, brand `Symbol.for('prisma:auth/instance-secret')`, minted per provider as a stable `Prisma.ServiceKey` in hosted deploy state | Zero-click-ops: the user binds nothing. ADR-0029 `envSecret` would demand every user mint and manage a random value by hand. Needs one small target-side extension (see "Framework work") — fallback if rejected: `envSecret` in v1, mint later |
| D9 | OAuth client secrets are ADR-0029 `secret()` slots bound with `envSecret(...)`; client ids are params | Human-registered external values with a real out-of-band source — the exact case ADR-0029 exists for |
| D10 | Two rpc ports (`session`, `admin`) + one http port (`api`), all backed by **one** service; least-privilege split enforced by wiring | Email's multi-port convention (send/outbox): unique method names, one `serve()` map, a consumer only reaches what the root wired to it |
| D11 | The `api` port is **unauthenticated by design** (it *is* the authentication surface), rate-limited by Better Auth; the rpc ports get ADR-0030 per-binding service keys for free | Login/signup can't demand a bearer key; service-to-service surfaces keep the standard protection |
| D12 | Auth's tables are created/migrated **by the auth service at boot** (Better Auth's migration engine under a Postgres advisory lock) | Storage and email both do DDL-at-connect; deterministic framework-owned migration of auth's tables is the milestone-2 (shared-DB) problem, where it becomes a checked-in Prisma Next contract |
| D13 | Mounted-in-app = a **library export**, not a module: `@prisma/composer-prisma-cloud/auth/embedded` exports `createEmbeddedAuth({ db, email, options })` returning a configured Better Auth instance the consumer mounts on its own routes | ADR-0016 excludes an embedded module mode, and rightly — nothing about the module machinery is involved. Both shapes share one internal `buildAuthOptions()`, so dedicated and embedded stay behaviorally identical |
| D14 | Email touchpoints: auth ships its own template set; send callbacks mint **one idempotency key per callback invocation** (`hash(purpose, userId, token)`) and reuse it across internal retries; template renderers validate the link URL's origin against `baseUrl` and HTML-escape before interpolation | The two #146 review findings, closed structurally |
| D15 | Consumer-facing golden path for browsers: the app **proxies** `/api/auth/*` to the auth service (same-origin cookies, no CORS story). Direct cross-origin + bearer tokens is documented as the SPA alternative | Third-party-cookie rules make the direct path the sharp-edged one; the proxy is boring and works |

## Contract sketch

Everything below lives in `src/contract.ts` (authoring plane) unless noted.
arktype throughout; shapes are illustrative, not pinned.

```ts
// ——— shared record shapes ———
const userRecord = type({
  id: 'string',
  email: 'string',
  emailVerified: 'boolean',
  name: 'string | null',
  image: 'string | null',
  banned: 'boolean',
  createdAt: 'string',           // ISO, matching email module's convention
  updatedAt: 'string',
});

const sessionRecord = type({
  id: 'string',
  userId: 'string',
  expiresAt: 'string',
  ipAddress: 'string | null',
  userAgent: 'string | null',
  createdAt: 'string',
});

// ——— port 1: the public HTTP surface ———
// Better Auth's own routes. Consumers wire it to proxy, or read `url` to
// point a browser client at it. Kind 'http' per ADR-0015 (thin fetch
// wrapper binding); if the http kind isn't shipped yet, this becomes a
// minimal config contract `{ url }` — same wiring, weaker binding.
export const authApiContract = /* http contract */;

// ——— port 2: session (consumer-facing online checks) ———
export const authSessionContract = contract({
  getSession: rpc({
    // the online path: validates the session token against the DB —
    // instant-logout semantics, one network hop
    input: type({ token: 'string' }),
    output: type({ session: sessionRecord.or('null'), user: userRecord.or('null') }),
  }),
  getUser: rpc({
    input: type({ id: 'string' }),
    output: type({ user: userRecord.or('null') }),
  }),
});

// ——— port 3: admin (tier-1 admin path) ———
export const authAdminContract = contract({
  getUser: rpc({
    input: type({ 'id?': 'string', 'email?': 'string' }),   // exactly one required, checked at runtime
    output: type({ user: userRecord.or('null') }),
  }),
  listUsers: rpc({
    // email-outbox conventions: AND-combined filters, keyset cursor,
    // newest-first, limit 1–200 default 50
    input: type({ 'query?': 'string', 'banned?': 'boolean', 'cursor?': 'string', 'limit?': '1<=number.integer<=200' }),
    output: type({ users: userRecord.array(), 'nextCursor?': 'string' }),
  }),
  listSessions: rpc({
    input: type({ userId: 'string' }),
    output: type({ sessions: sessionRecord.array() }),
  }),
  revokeSession: rpc({
    input: type({ sessionId: 'string' }),
    output: type({ revoked: 'boolean' }),
  }),
  revokeUserSessions: rpc({
    input: type({ userId: 'string' }),
    output: type({ revokedCount: 'number.integer' }),
  }),
  banUser: rpc({
    input: type({ userId: 'string', 'reason?': 'string', 'expiresAt?': 'string' }),
    output: type({ user: userRecord }),
  }),
  unbanUser: rpc({
    input: type({ userId: 'string' }),
    output: type({ user: userRecord }),
  }),
  // deliberately absent in v1: createUser (seeding — maybe), deleteUser
  // (cascade semantics across consumer references are unresolved), and
  // impersonation (needs the authz story the admin path deferred)
});

// ——— the stateless verifier (dependency factory, not a port op) ———
// Depends on the api port; hydrate builds a jose remote-JWKS verifier.
// Zero calls to the auth service after the first JWKS fetch (cached,
// kid-keyed, refetch on unknown kid).
export interface VerifiedSession {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly expiresAt: Date;
  readonly claims: Record<string, unknown>;
}
export function jwtVerifier(): DependencyEnd<
  { verify(token: string): Promise<VerifiedSession | null> },
  typeof authApiContract
>;

// ——— module factory ———
export function auth(opts?: {
  name?: string;
  social?: { github?: boolean; google?: boolean };   // extends declared needs, D7
}): ModuleNode<
  { db: PostgresDep; email: EmailSenderDep },        // boundary deps (D2, D14)
  { api: typeof authApiContract; session: typeof authSessionContract; admin: typeof authAdminContract },
  /* secrets */ SocialSecretsFor<Opts>,              // {} when no social; instance secret is a provisioning need, not a slot (D8)
  /* params  */ { baseUrl: ParamNeed }               // public URL for links + JWT issuer
>;
```

Consumer wiring, end to end:

```ts
// root module.ts
const mail = provision(email(), { params: {...}, secrets: {...} });
const db   = provision(postgres({ name: 'auth-db' }));   // or the app's shared db
const idp  = provision(auth(), {
  deps:   { db, email: mail.send },
  params: { baseUrl: envParam('AUTH_BASE_URL') },
});
provision(apiService,  { deps: { auth: idp.api, verifier: jwtVerifier() /* ← idp.api */ } });
provision(adminService,{ deps: { authAdmin: idp.admin } });

// inside apiService — the stateless path
const session = await verifier.verify(bearerToken);
if (!session) return unauthorized();

// inside a route that needs instant-logout semantics — the online path
const live = await session.getSession({ token });
```

## Package layout

New workspace package `packages/1-prisma-cloud/2-shared-modules/auth`,
name `@internal/auth`, published as `@prisma/composer-prisma-cloud/auth`.
Mirrors email exactly; the one extra subpath is `./embedded` (D13).

```
auth/
├── package.json          # exports: . / ./auth-service / ./auth-entrypoint / ./embedded / ./testing
├── README.md             # contract scope, wiring, local dev, proxy pattern
├── tsdown.config.ts / tsconfig.json
└── src/
    ├── contract.ts           # contracts above + jwtVerifier
    ├── auth-module.ts        # auth() factory
    ├── auth-service.ts       # compute() node
    ├── auth-options.ts       # buildAuthOptions(): the one Better Auth config (shared with embedded)
    ├── templates.ts          # defineTemplates({ verification, passwordReset, magicLink })
    ├── handlers.ts           # session + admin rpc handlers (wrap better-auth admin API)
    ├── embedded.ts           # createEmbeddedAuth() (D13)
    ├── execution/
    │   ├── auth-entrypoint.ts    # boot: migrate (advisory lock) → compose fetch handler:
    │   │                         #   /api/auth/* → betterAuth.handler (public)
    │   │                         #   /rpc/*      → serve() (bearer-checked, ADR-0030)
    │   └── testing.ts            # startLocalAuthServer()
    └── exports/…                 # one re-export file per subpath, per exports-entrypoints.mdc
```

The Prisma Next extension pack for `auth:User` (D3) is milestone-2 work and
will live beside the contract (`src/pack/` + a checked-in `contract.json`),
mirroring `@prisma-next/extension-supabase`.

## Framework work this module forces (flagged, not smuggled)

1. **Provider-own minted secret** (D8). Streams' provisioner mints on demand
   of a *consumer edge* and its provider-param `value(refs)` returns
   `undefined` for zero consumers. Auth needs mint-unconditionally-for-the-
   provider (the secret exists even with no rpc consumers). Small extension
   in `@internal/prisma-cloud`'s descriptors; the brand/param/env plumbing is
   copy-shaped from `streams-keys.ts`. Accepted consequence: rotating the
   minted value invalidates sessions and the encrypted jwks rows — rotation
   story deferred, documented.
2. **Multi-contract-per-database slice** (D4, milestone 2): two contracts on
   one database when namespaces are disjoint and cross-references go through
   contract spaces. This is the ADR-0022 deferral; auth is its first real
   customer. Not v1.
3. **`http`-kind binding** (port `api`): ADR-0015 names it; if the fetch-
   wrapper binding isn't actually shipped, v1 uses a `{ url }` config
   contract and the verifier/proxy build their own fetch.

## Admin-path feedback (for the tier-1 conventions pass)

Where auth wants a different shape than email's `outbox` established:

- **Mutating admin operations.** Outbox is read-only; auth's admin port
  revokes and bans. Tier-1 conventions need a stance on mutations (naming,
  idempotency, audit trail) — auth provides the first examples.
- **Two privilege tiers below admin.** Auth splits consumer-facing online
  reads (`session`) from operator actions (`admin`). Email collapses those
  into one port. If more modules grow the split, the convention should name
  it (e.g. every module may expose `<runtime>` and `admin` ports).
- **Pagination/filter conventions transfer cleanly** (cursor, limit 1–200,
  AND-filters) and should be written down as *the* admin-port idiom.

## Local dev & testing

- `startLocalAuthServer({ port?, db })` (testing export): real Better Auth +
  real handlers against local Postgres, instance secret fixed to a dev
  constant, email wired to the email module's local server (or any
  `EmailSender` fake). An e2e test signs up, reads the verification /
  magic-link URL back out of the email outbox port, completes the flow —
  no cloud credentials anywhere (DoD 5).
- Conformance-style integration tests both local and deployed (streams
  precedent), plus type-level tests for the factory's conditional
  secrets/params shapes (D7) — that's the trickiest typing in the module.
- Smoke: `examples/storefront-auth` grows into the real consumer (strategy
  doc default): replace its toy `modules/auth` with this module; second
  service (`storefront`) proves the JWT-verified hop (DoD 3).

## Milestones

1. **Design review** — this document. ← we are here
2. **v1 module** — package above, deployed smoke via storefront-auth,
   magic-link e2e, local dev. Plain-id user references. Instance secret via
   D8 if the target extension is accepted, else `envSecret` fallback.
3. **FK mode** — auth extension pack + ADR-0022 multi-contract slice +
   shared-db wiring documented; storefront example gains a real
   `Profile.userId → auth:User` constraint.
4. **Post-v1 surface** (each opt-in, contract-preserving): social providers
   beyond the first two, organizations/2FA/passkeys, admin web UI (tier 2)
   riding the admin port.

## Open questions for review

1. **D8 vs fallback**: is the small target-side extension (provider-own
   minted secret) acceptable scope for v1, or ship `envSecret` first?
2. **D2**: comfortable with `db` as a mandatory boundary dep (one extra root
   line for standalone use), or should the module self-provision by default?
3. **`session.getUser` placement**: consumer-facing port (as sketched) or
   admin-only? Argument for consumer-facing: profile rendering off a JWT
   `sub` without admin privileges. Argument against: it's PII fan-out.
4. **Naming**: `session` port vs `users`; `jwtVerifier()` vs `authVerifier()`;
   module factory `auth()` collides with nothing today — keep?
5. **Milestone 3 timing**: start the ADR-0022 slice conversation now (it
   needs prisma-next coordination) or after v1 ships?

## Anything for PR #146?

Nothing missing from the email contract for auth's needs — templates are
consumer-declared, all three auth emails are expressible, the outbox port is
the local-dev readback. The two obligations its review surfaced (idempotency
key reuse, link escaping) are closed by D14 on our side. No comment needed
beyond confirming auth as first consumer works against the contract as-is.
