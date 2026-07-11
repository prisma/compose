/**
 * The swap boundary (ADR-0020): the app calls `cron()` and never provisions
 * the scheduler itself, so a future native realization is an internal change,
 * not an app change. `cron()` is ordinary composition — no new primitive: it
 * provisions the app's router with the system's own inputs forwarded
 * straight through (the router's deps ARE the system's boundary deps), then
 * provisions the reusable scheduler wired to the router's `trigger` port.
 */
import type { Deps, ServiceNode, SystemNode } from '@prisma/app';
import { system } from '@prisma/app';
import { blindCast } from '@prisma/app/casts';
import type { TriggerContract } from './contract.ts';
import type { Schedule } from './schedule.ts';
import { cronScheduler } from './scheduler.ts';

/**
 * Wraps `opts.router` (a service exposing `{ trigger }`) with the reusable
 * scheduler that fires `opts.schedule` against it. The returned system's
 * boundary deps mirror the router's own deps — the parent wires the real
 * work target through them, e.g.
 * `provision('cron', cron('cron', { schedule, router }), { worker: worker.rpc })`.
 * Exposes nothing.
 */
export function cron<RD extends Deps, Ids extends string>(
  name: string,
  opts: {
    schedule: Schedule<Ids>;
    // biome-ignore lint/suspicious/noExplicitAny: accepts any concrete router service; ServiceNode generics are invariant (mirrors provision()'s own service overloads).
    router: ServiceNode<RD, any, { trigger: TriggerContract }>;
  },
): SystemNode<RD, Record<never, never>> {
  return system(name, { deps: opts.router.inputs }, ({ inputs, provision }) => {
    // `inputs[K]` (InputRef<RD[K]>) is the router's own required contract
    // plus a `__providerId` brand — assignable to the bare contract
    // `provision`'s (unexported) `Wiring<RD>` wants at every concrete RD.
    // TypeScript can't verify two differently-shaped mapped types line up
    // while RD is still an abstract type parameter, so it rejects the
    // (structurally valid) forward; `never` is a subtype of everything,
    // sidestepping that comparison rather than fighting it per-key.
    const routerWiring = blindCast<
      never,
      "inputs is InputRef<RD[K]> per key (Req & { __providerId }), assignable to RD[K]'s bare Req at every concrete RD; TypeScript can't confirm that while RD stays abstract, since it can't resolve two differently-named conditional types over an unresolved generic key — never is a subtype of the wiring parameter's type at every instantiation, so this forwards the real inputs value without fighting that limitation"
    >(inputs);
    const router = provision('router', opts.router, routerWiring);
    provision('scheduler', cronScheduler(opts.schedule), { trigger: router.trigger });
    return {};
  });
}
