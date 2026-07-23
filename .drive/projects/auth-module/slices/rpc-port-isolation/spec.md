# Slice S5 (proposed): rpc-port-isolation — spec draft

> Status: **draft, pending operator confirmation** (fork raised 2026-07-23;
> operator asked for the isolation story, hasn't yet picked S1-scope vs
> own-slice). Grounding items below are deliberately open — they resolve at
> slice pickup, not in this draft.

## At a glance

Make a service's ports real at the transport level. Today rpc dispatch is
flat (`POST /rpc/<method>`) and the ADR-0030 bearer check accepts any key
minted for the service against any method — port-level least privilege is
enforced only by the typed client. Two coupled changes:

1. **Port-scoped dispatch**: `POST /rpc/<port>/<method>`. The generated
   client derives the port segment from the binding (the wired edge targets
   a specific exposed port). Kills the cross-port method-name collision
   class (D5's `getUser` collision).
2. **Per-port key acceptance**: accepted keys partition by exposed port
   (keys are already minted per binding; the mint side knows the edge's
   target port). `serve()` checks the presented key against the addressed
   port's set — a `session`-wired consumer's key no longer passes for
   `/rpc/admin/*`.

## Why now

Auth is the first module whose admin port mutates (revoke/ban). "Isolation
by politeness" is the wrong trust model for it, and S3 deploys it into the
flagship consumer example. This is also the first concrete slice of the
admin-path authz story ("wiring is the access control") — done here, the
admin-path design pass inherits a settled convention instead of a deferral.

## Scope

**In:** `@internal/service-rpc` (`serve()`, `makeClient`, path scheme),
the target's key provisioning rail (per-port accepted-key storage —
today's single `COMPOSER_RPC_ACCEPTED_KEYS`), redeploy notes for existing
rpc services (email), auth + email test updates, a wire-format note in the
service-rpc README/ADR territory (likely a new ADR amending ADR-0030).

**Out:** per-METHOD authz (stays deferred per ADR-0030), any admin-web-UI
work, `session.getUser`/`admin.findUser` re-rename (keep `findUser` — the
names are clearer apart even without the collision; zero churn).

## Grounding needed at pickup (not improvised here)

1. Does the dependency edge carry the target-port identity through the
   provisioning rail today (rpc's `perBindingToken` provision need is
   declared on the binding's connection params — confirm the provisioner's
   `edge` exposes the port), or does the edge need to grow it?
2. Accepted-set storage shape: one JSON object `{ [port]: keys[] }` in the
   existing env var vs per-port vars — decide against the serializer's
   provider-param machinery, not aesthetics.
3. Back-compat: pre-1.0, all consumers in-repo — confirm no deployed
   environment needs a dual-accept window; if one does, serve() accepts
   both path forms for one release.
4. ADR: amend ADR-0030 or new ADR referencing it.

## Slice DoD

- A consumer wired only to a non-admin port presents its key to an admin
  port's route and gets 401/404 — proven by an integration test through
  real `serve()` + `makeClient`.
- Email + auth suites green with no semantic test changes beyond paths.
- The cross-port duplicate-method restriction in `serve()` is lifted.
