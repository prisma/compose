# Strategy — the agent bet

> Status: draft, 2026-07-12. Owner: Will Madden. This document states the bet
> the Prisma Compose work is making, why we think it wins, and what that
> implies for sequencing. [goals.md](goals.md) lists the framework's technical
> goals; this document explains what they are *for*.

## The bet

Most new applications will be written by agents — inside app-builder platforms
(Lovable, Bolt, v0), and inside coding harnesses (Claude Code, Cursor). We bet
that the data platform that wins in that world is the one agents **succeed
with most often**, and we aim at one claim:

**Prisma is the easiest way for an agent to build, evolve, deploy, and operate
a real application.**

The money is Prisma Cloud consumption. Everything else — Prisma Next, Prisma
Compose, the Supabase extension — is open tooling whose job is to shorten the
distance from "an agent starts building" to "an app running on Prisma Cloud."
Every design decision can be tested against that: does it make an agent more
likely to succeed, and does success land on Prisma Cloud?

## Why we win: agents fail differently than humans

Agents do not struggle with boilerplate; they generate it endlessly. They
struggle with three things, and each maps to an asset we already have:

1. **Schema evolution without breakage.** The hardest problem in agent-built
   apps is changing the data model of a running application without losing
   data or breaking queries. Prisma Next solves this: a typed data contract,
   verified against the live database, with managed migrations. This is the
   deepest moat — competitors court agents with hosting and functions, not
   with safe schema evolution.
2. **Wiring.** Auth, secrets, service-to-service connections — the places
   agents hallucinate config. Compose makes wiring a typed, checked language:
   modules declare dependencies, dependencies resolve to bindings, and a
   miswired app fails typecheck instead of failing in production
   (ADR-0013/0015/0022).
3. **Verification.** An agent needs to know whether what it built works,
   without a human looking at it. Compose gives a machine-checkable ladder:
   typecheck → validate → plan → deploy → smoke, each step fast and each
   failure legible. Error text is API surface here: agents iterate on error
   messages, so error quality is product quality.

One more asset cuts across all three: **a stage is a branch**
(ADR-0023/0024). Disposable per-session preview environments — including the
database — are exactly what agent platforms need and what nobody else offers
at the data layer.

## The product: three loops

The deliverable is not a feature list; it is three loops an agent runs, each
of which must be excellent:

- **Scaffold loop** — empty directory → running composed app in one command,
  assembled from prebuilt modules for the parts agents fumble most (auth
  first; then email, storage, billing). The module catalog is core product,
  and it is *curated*: five excellent modules beat thirty mediocre ones,
  because an agent cannot judge quality.
- **Feedback loop** — every mistake surfaces as a fast, machine-legible
  failure with an actionable message. Typecheck and validation catch wiring
  errors; a dry-run plan catches deploy errors before they happen.
- **Deploy loop** — one command deploys repeatably to Prisma Cloud; branches
  give previews; destroy is safe. The same topology runs locally with
  stand-ins, so agents can verify without cloud credentials.

## The pieces and how they compose

- **Prisma Next** — the data contract layer: typed queries, verified
  migrations, safe evolution. Already strong; it carries the schema-evolution
  moat.
- **Prisma Compose** — the composition and deploy layer: modules, typed
  wiring, targets, stages. Carries the wiring and verification moats.
- **Prisma Cloud** — the destination and the business: Postgres, Compute,
  cron, RPC today; streams and websockets when real apps pull them.
- **The Supabase extension** (`@prisma-next/extension-supabase`, in
  prisma-next) — the adoption wedge. Agent platforms build on Supabase
  today; the extension puts Prisma Next's contract, RLS authoring, and
  role-bound runtime *inside* that ecosystem without asking anyone to
  migrate. An agent that meets Prisma Next on Supabase has already adopted
  the layer that matters most; Compose and Prisma Cloud are then a
  destination, not a rewrite.

## Go-to-market: two motions in parallel

**Bottom-up (we control this).** Ship agent-facing surfaces — skills,
`llms.txt`, possibly an MCP server — into the harnesses where agents already
work. Publish the benchmark (below). Word of mouth among agent operators
carries it; no partnership is a dependency.

**Partner (the prize).** Approach Lovable-class platforms directly. Their
requirement is a headless story: programmatic project provisioning
(Management API), deploy API, per-tenant billing, branch-per-preview. This is
a different build than the CLI and we scope it when a live partner
conversation demands it — but the bottom-up artifacts (benchmark, modules,
skills) are the pitch material, so the motions share a spine.

## The north star: an agent eval

"Easiest way for agents to build" is a testable claim, so we test it. Define
a golden-path eval: an agent starts in an empty directory and must ship a
real app (e.g. a storefront with auth) on Compose, unassisted. Run it
repeatedly with Claude Code:

- **Every failure is a roadmap item**, ranked by frequency. The roadmap is
  written by observed agent failures, not intuition.
- **Docs are written where agents actually stumble** — as skills and
  reference the eval proves are needed, not a speculative doc site.
- **The same harness against a Supabase baseline becomes the marketing
  artifact**: a published benchmark showing agents succeed more often here.

The forcing-function apps (datahub, open-chat — see
`.drive/projects/forcing-function-apps/`) remain the *capability* pull:
secrets, cron, object storage, streams, the dev loop. The eval is the
*quality* pull: scaffolding, error text, skills. Both run; the eval is the
north star because a human-operated port cannot surface agent failure modes.

## Implied sequence

1. **Land the Prisma Compose rename** (branch `claude/prisma-compose-rename`)
   — everything written after it depends on settled names.
2. **Build and run the golden-path eval.** Let the first ten failures write
   the near-term roadmap.
3. **Curated module set**, starting with auth — the single part agents fumble
   most and the anchor of every scaffolded app.
4. **Secrets / env / wiring end-to-end**, pulled by datahub, consumed by the
   eval app.
5. **Agent-facing docs**: skills, `llms.txt`, package READMEs — in the order
   the eval shows they are needed.

## Deferred, and why

- **Second deploy target** (Vercel/Supabase/Cloudflare hosting). Money is
  Prisma Cloud consumption, so a second target is built when a paying partner
  demands it, not before. Keep the target seam honest (ADR-0011/0019) so the
  option stays cheap.
- **Websockets / durable streams.** Built when a real app (open-chat) or the
  eval pulls them.
- **A broad module ecosystem/registry.** Curated catalog first; registry
  mechanics (naming, hosting, discovery) once there are more modules than a
  README can list.
- **A human documentation site.** Agent surfaces first; they are cheaper and
  measurable via the eval.

## Risks

- **Incumbents are courting agents too.** Supabase is the default backend of
  the platforms we want; Convex markets directly to agents. Our
  differentiation must stay where they are weak: schema evolution, typed
  wiring, branched data environments. The Supabase extension turns the
  biggest incumbent into a channel.
- **Eval overfitting.** A single golden path can make us excellent at one
  demo. Rotate scenarios once the first path is reliable.
- **Partner dependency.** The headless build is significant; committing to it
  without a signed partner burns the roadmap. Hence: bottom-up funds the
  pitch, partner work starts on demand.
- **Naming churn.** ADR-0025/0026 settled Module and Prisma Compose; the
  package rename must land before external surfaces multiply.

## Decisions this document records

- The customer is an agent; the buyer is whoever pays for Prisma Cloud.
- Revenue is Prisma Cloud consumption; Compose and Prisma Next stay open.
- Both go-to-market motions run in parallel; bottom-up is never hostage to a
  partnership.
- The roadmap is driven by observed agent failures (the eval) plus real-app
  capability pull (forcing-function apps) — not by feature intuition.
