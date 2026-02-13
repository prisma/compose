# Cloudflare platform user domain (research)

This doc focuses on the **user's mental model**: what concepts they name, configure, and rely on day-to-day — and how that maps to internal mechanics.

Source context: [Cloudflare Workers Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

## The user's ubiquitous language (what they "think in")

- **Worker**: "my code that runs at the edge"
- **Binding**: "a resource my Worker can use" (DB, bucket, queue, other Worker)
- **Route**: "where HTTP traffic is sent to my Worker"
- **Cron**: "when my Worker runs on a schedule"
- **Config**: "what my Worker needs" (wrangler.toml)

### The key user promise

The recurring flow is:

1. **Write a handler** that receives `(request, env)` (or equivalent).
2. **Declare bindings** in config so `env` has the resources you need.
3. **Deploy** — the platform provisions, wires, and runs.

No manual credential management; bindings are permission + API in one.

## User concepts vs internal mechanics (mapping)

| User concept | What it feels like | Internal-ish mechanism it implies |
|---|---|---|
| Worker | "My edge function" | Isolate + entry point + env injection |
| Binding | "I have a DB / bucket / queue" | Platform-provisioned resource + stub injected into env |
| Route | "Traffic to example.com/* hits my Worker" | Edge routing rule; request routed to Worker |
| Cron | "Run every 5 minutes" | Scheduler invokes Worker with cron payload |
| Config | "My Worker's wiring" | Manifest consumed by Wrangler + platform |

## Is the user's domain map the same as the system's?

Roughly — the platform exposes what the user thinks in.

- **Bindings** are explicit: you declare what you need; you get it on `env`. No discovery via globals.
- **Artifacts** are implicit: users run `wrangler deploy`; they don't usually manage bundles directly.
- **Control vs runtime** is clear: config + build + deploy (control); handler execution (runtime).

The main gap: **provisioning** can be implicit (Wrangler may auto-create resources for draft bindings) or explicit (`wrangler d1 create` then reference). The mental model is "I declare it; it exists," but the mechanics can vary.

---

## Open questions / assumptions

- **Assumption**: Users primarily interact via wrangler config + handler code; dashboard is secondary for day-to-day dev.
- **Open question**: How much do users need to understand isolate lifecycle (e.g. global-scope pitfalls when bindings change)?

