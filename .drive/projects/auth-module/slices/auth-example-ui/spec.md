# Slice spec: `examples/auth` gains a wired-up Better Auth UI, runnable locally

> Status: goal + architecture + gates pinned (Will, 2026-07-24). This is an
> integration against a third-party kit and the Composer local-dev pipeline, so
> where the exact kit API or Next-service wiring is not knowable without doing
> it, this spec pins the REQUIREMENT and the reference pattern and names the
> fallback — it does not guess third-party signatures. The DoD is a
> browser-verified working local run; the implementer proves it, not asserts it.

## 1. Goal (what "done" looks like)

A developer clones the repo, runs ONE command in `examples/auth`, opens the
printed URL, and sees a real Better Auth sign-up / sign-in / magic-link UI —
built from the accepted off-the-shelf kit — working end to end against a local
auth service with no cloud credentials. Signing up, verifying, logging in, and
seeing "who am I" all work in the browser.

## 2. The kit (pinned) + fallback

- **Better Auth UI** — `better-auth-ui.com`, the shadcn/ui-based kit
  (`<SignIn>`/`<SignUp>`/etc.), installed via its shadcn registry
  (`shadcn add https://better-auth-ui.com/r/auth.json` or the current documented
  path — verify the exact install against the kit's docs at build time). It is
  the de-facto standard in the Next.js + Better Auth ecosystem; Better Auth core
  ships no UI.
- **Fallback (only if the kit genuinely can't be wired):** hand-built
  login/signup forms against `better-auth/client` (`createAuthClient`). Trigger
  the fallback ONLY if the kit is incompatible with the pinned `better-auth`
  (see § 6) or cannot be wired through our proxy; if you fall back, STOP first
  and report why (Will chose the kit deliberately).

## 3. Architecture (the consumer front door)

The example's **`api` service becomes the browser front door: a Next.js app**,
mirroring `examples/storefront-auth/modules/storefront` exactly — `output:
'standalone'`, run as a Composer compute service via
`@prisma/composer/nextjs/control` (`standaloneServerPath` / the boot seam that
example uses). Read that example first; copy its Next-as-a-service wiring rather
than inventing one.

The api (now Next) service:
- Renders the Better Auth UI pages (sign-up, sign-in, magic-link) using the kit.
- Mounts **`authProxy`** at `/api/auth/*` on its own origin (a Next route
  handler forwarding to `deps.authApi`), so the browser client is **same-origin**
  → first-party cookies, no CORS. This is the module's golden path (spec D11).
- Keeps the existing JSON demo surfaces as route handlers so the deployed smoke
  and the JWT/session story survive: `/me` (stateless JWT verify via
  `deps.verifier`), `POST /session` (`deps.session.getSession`), `/health`.
  Surface `/me` and `/session` as small visible panels in the UI so the
  JWT-vs-instant-logout tradeoff is legible.

The browser client is `createAuthClient({ baseURL: <the api service's own
origin> })` — NOT the auth service origin — so requests hit `<app>/api/auth/*`
→ proxy → auth service. Configure the client's plugins to match the server's
enabled set (email+password, magicLink; admin is NOT a consumer-UI surface).

The **`ops` service stays as-is** (admin + outbox, JSON) — least-privilege by
wiring is unchanged. The `auth()`/`email()`/`db` module wiring in `module.ts`
is unchanged except where a new `web`-facing binding is genuinely needed.

## 4. The local email problem (a real forcing function — must be solved)

Signup runs `requireEmailVerification: true`; local delivery is
`deliveryMode: none`, so the verification (and magic-link) email exists only in
the email module's **outbox**, and a browser user has no inbox. The demo MUST
give the browser user a way to click that link. Pinned solution: a small
**dev "inbox" page** in the app that reads the latest email for an address from
the email module's outbox (through the ops service's existing
`/admin/find-sent-email` route, or an equivalent read against the outbox port —
never a second email client) and renders its verification / magic-link URL as a
clickable link. This doubles as a visible proof of the module-to-module email
wiring. (Do NOT relax `requireEmailVerification` to dodge this — proving the
real verified flow is the point.)

## 5. Local run — one command, browser-verified

- **Primary:** wire `examples/auth` to the real Composer local-dev pipeline —
  `"dev": "prisma-composer dev module.ts"` (ADR-0041) — bringing up api + ops +
  auth + Postgres locally, credential-free. This example would be the FIRST to
  use the real `dev` command; expect to shake out friction.
- **Fallback:** if `prisma-composer dev` has blocking friction for this module,
  a lighter `scripts/dev.ts` (mirror `examples/store/scripts/dev.ts` /
  `examples/storefront-auth/.../scripts/dev.ts`) that boots the Next app +
  `startLocalAuthServer` + `startLocalEmailServer` on loopback ports. If you use
  the fallback, say so and why in the report.
- **One command:** `pnpm --filter @prisma/example-auth dev`, then open the
  printed URL.
- **Browser verification is part of the DoD, not optional.** Use the Playwright
  tools to drive the running local app in a browser and confirm: sign-up →
  (click the verify link from the inbox view) → verified → sign-in → the "who am
  I" panel shows the user; and a magic-link sign-in round-trip. Capture a
  screenshot of the working signed-in state.

## 6. Compatibility checks to run EARLY (before building the whole thing)

Do these first and report if either fails (they decide kit-vs-fallback):
1. **Kit ↔ `better-auth` version.** The module pins `better-auth@1.6.24`
   (`packages/1-prisma-cloud/2-shared-modules/auth/src/package.json`). Confirm
   Better Auth UI supports a client built against 1.6.24; if it hard-requires a
   newer better-auth, STOP and report (do not bump the module's pinned
   better-auth — that regenerates the pack schema; out of scope).
2. **Kit ↔ our wiring.** Confirm the kit's client works pointed at the app
   origin through `authProxy` (not Better Auth mounted directly), with our
   plugin set. Build a minimal page wired to a local `startLocalAuthServer`
   FIRST and confirm one sign-in works in a browser before building out all
   pages.

## 7. The deps-inference fix (Will's #173 review — folds in here)

Will objected (STOP DOING THIS / INFER YOUR DEPENDENCIES) to the hand-declared
`ApiDeps`/`OpsDeps` interfaces. Remove them entirely:
- `service.load()` already infers the deps type — the hydrated type is
  `ReturnType<typeof apiService.load>` (equivalently `HydratedDeps<...>`,
  exported from `@prisma/composer`). No hand-declared dep interface anywhere.
- The Next api service reads `service.load()` directly (inferred deps); the
  ops app, if it keeps a factory, types its parameter off
  `ReturnType<typeof opsService.load>`.
- The integration test moves to the framework testing seam:
  **`bootstrapService(apiService, { service: { port }, inputs: { authApi: { url },
  verifier: { url }, session: { url } } })`** and the same for `opsService`,
  pointing the input URLs at `startLocalAuthServer` — deps inferred, no
  hand-injected interface. Reference `examples/cron/tests/*.integration.test.ts`
  and `examples/storefront-auth/.../page.integration.test.ts`.

## 8. Unchanged / out of scope

- The `auth`/`email` modules themselves, the pack, the target — untouched.
- The deployed smoke (`scripts/smoke.ts`) keeps working (adjust only if the api
  service's route surface moved; the JSON routes must survive).
- Password reset, social providers, the admin UI — NOT built (Will: login/signup
  is the must-have).
- Do not bump `better-auth`.

## 9. Validation / DoD

1. `pnpm --filter @prisma/example-auth dev` (or the fallback) brings the app up
   locally with no cloud creds.
2. **Browser-verified** (Playwright, screenshot captured): sign-up → verify via
   the inbox view → sign-in → identity panel; plus a magic-link sign-in.
3. `examples/auth` tests green, now driven through `bootstrapService` (no
   `ApiDeps`/`OpsDeps` in the tree — grep proves it).
4. Root `pnpm typecheck`; `pnpm lint`/`lint:deps`/`lint:casts`; the example
   builds (`next build` standalone succeeds).
5. The deployed `scripts/smoke.ts` still type-checks and its route expectations
   still hold (do not re-run the cloud deploy in this slice unless a route moved
   and you must confirm — flag if so).
6. README section: what the demo shows and the one command to run it.

## 10. Stop-and-report conditions

- Kit incompatible with `better-auth@1.6.24` or unwireable through the proxy
  (§ 6) → STOP, report, propose the fallback.
- `prisma-composer dev` has blocking friction → use the dev-script fallback and
  report (don't silently abandon the idiomatic path without saying so).
- The Next-as-a-service wiring needs a framework change beyond mirroring
  storefront-auth → STOP and report.
- Any point where the browser flow can't be made to work end to end locally →
  STOP and report with what you observed; do NOT declare done without the
  browser proof.

## Branch / PR

Branch `claude/auth-example-ui`, stacked on `claude/auth-adr-0041-migration`
(#173). Its own PR. Reply on Will's two #173 comment threads pointing here for
the deps-inference removal. Rebases with the stack as #161 → #173 land.
