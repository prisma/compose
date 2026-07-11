/**
 * The unit-test seam (testing.md § Unit): `stubLoad` replaces a service
 * node's `load()` output with a typed double, so code that calls
 * `service.load()` runs with no server and no environment. Target-agnostic —
 * every service node has a `load()` — and performs no module mocking itself;
 * wiring the substitution into a test runner (`vi.mock`, `mock.module`) stays
 * in the test.
 */
import { blindCast } from './casts.ts';
import type { Params, Values } from './config.ts';
import type { Deps, Expose, HydratedDeps, Loaded, RunnableServiceNode } from './node.ts';

/**
 * `stubLoad`'s override argument: every declared dependency, typed against
 * its own hydrated shape (`Client<C>` for an RPC dep, the resource binding
 * for a resource dep) — a double of the wrong shape is a compile error. The
 * service's own params are optional; an omitted one falls back to its
 * declared default, same as a real `load()`.
 */
export type LoadOverrides<D extends Deps, P extends Params> = HydratedDeps<D> & Partial<Values<P>>;

function paramDefaults<P extends Params>(params: P): Partial<Values<P>> {
  const defaults: Record<string, unknown> = {};
  for (const [name, param] of Object.entries(params)) {
    if (param.default !== undefined) defaults[name] = param.default;
  }
  return blindCast<
    Partial<Values<P>>,
    "assembled from each param declaration's own default value, one key per param that declares one — exactly Partial<Values<P>> by construction"
  >(defaults);
}

/**
 * Returns a service node whose `load()` yields `overrides` merged with the
 * service's own param defaults — everything else about the node (its deps,
 * params, build, expose) is unchanged. `run()` is not meaningful on a stub
 * (there is no boot, no environment) and throws if called.
 */
export function stubLoad<D extends Deps, P extends Params, E extends Expose>(
  service: RunnableServiceNode<D, P, E>,
  overrides: LoadOverrides<D, P>,
): RunnableServiceNode<D, P, E> {
  const loaded = blindCast<
    Loaded<D, P>,
    'merges the param defaults with the caller-supplied overrides, which LoadOverrides<D, P> already types against HydratedDeps<D> & Partial<Values<P>> — exactly Loaded<D, P> once params are filled in'
  >({ ...paramDefaults(service.params), ...overrides });

  return Object.freeze({
    ...service,
    run(): Promise<unknown> {
      throw new Error(
        `stubLoad(): "${service.name}" is a load()-only stub — it has no run() (no boot, no environment).`,
      );
    },
    load: () => loaded,
  });
}
