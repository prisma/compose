/**
 * The execution-plane surface: hydrate declared Inputs into typed clients.
 * This is the host shim's dependency — the control plane (`@makerkit/core`)
 * never imports it, so Loading a graph pulls in no runtime/hydration code.
 */
export { hydrateDescriptor } from "./hydrate.ts";
export { hydratePostgres, DATABASE_URL_ENV_VAR } from "./postgres.ts";
export type { Env } from "./postgres.ts";
