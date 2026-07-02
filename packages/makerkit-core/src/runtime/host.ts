import { Load } from "../load.ts";
import type { RuntimeContext, ServiceHandle } from "../service.ts";
import type { Env } from "./postgres.ts";
import { hydrateDescriptor } from "./hydrate.ts";

/** The env-var name the shim resolves the serving port from. */
export const PORT_ENV_VAR = "PORT";

const DEFAULT_PORT = 3000;

/**
 * The generated Compute entrypoint (host shim). Loads and validates the
 * service graph, hydrates its declared Inputs from `env` — reading it here, at
 * the boundary — and calls the user handler with the typed clients plus a
 * serving context (the resolved port). Env terminates here: user code receives
 * only injected dependencies and this context, never `env` or `process.env`.
 *
 * The user handler owns its own server (`Bun.serve`) in this slice — there is
 * no Output/serving model yet — so `run` is expected to start listening and
 * its return value is passed back unchanged.
 */
export function runHost(service: ServiceHandle, env: Env = process.env): unknown {
  // Load before Hydrate: validate the graph's integrity before anything is
  // hydrated (authoring-surface.md — "validated at Load before any Hydrate").
  const graph = Load(service);

  const hydrated: Record<string, unknown> = {};
  for (const input of graph.inputs) {
    hydrated[input.name] = hydrateDescriptor(input.descriptor, env);
  }

  const ctx: RuntimeContext = { port: resolvePort(env) };

  // The shim works with an unparameterized handle, so the typed per-descriptor
  // hydrated map is only known dynamically here; the descriptor's hydrator is
  // the source of truth for each client's type.
  return service.run(hydrated as Parameters<typeof service.run>[0], ctx);
}

function resolvePort(env: Env): number {
  const raw = env[PORT_ENV_VAR];
  if (raw === undefined) return DEFAULT_PORT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
}
