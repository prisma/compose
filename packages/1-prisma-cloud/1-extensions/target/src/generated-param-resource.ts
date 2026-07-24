/**
 * The `GeneratedParam` Alchemy resource — generates a random value ONCE at
 * create and keeps it STABLE across deploys, so an unchanged service no-ops on
 * redeploy. The value is `bytes` random bytes produced with the Web Crypto
 * global (`crypto.getRandomValues` — no `node:` import, matching this package's
 * runtime-coupling invariant), base64-encoded, and persisted in Alchemy state;
 * on every later apply the provider returns the persisted attributes
 * (`reconcile`'s `output`) unchanged — the same way `S3Credentials` keeps its
 * pair stable. Changing `bytes` on an existing resource KEEPS the old value
 * (reconcile short-circuits on the persisted output); rotation is
 * destroy/recreate.
 *
 * One resource per `generatedParam()`-bound input leaf, provisioned by the
 * compute descriptor's serialize step; the resource id derives from the input
 * document row key and the leaf path, so the value is stable per service+leaf.
 *
 * Deploy-time only: imports `alchemy`. Imported by `control/extension.ts` and
 * tests, never by `index.ts` / the authoring entry.
 */
import { Resource } from 'alchemy';
import * as Provider from 'alchemy/Provider';
import * as Effect from 'effect/Effect';

export interface GeneratedParamProps {
  /** Byte length of the generated value (before base64 encoding). */
  readonly bytes: number;
}

export interface GeneratedParamAttributes {
  readonly value: string;
}

export type GeneratedParam = Resource<
  'PrismaCloud.GeneratedParam',
  GeneratedParamProps,
  GeneratedParamAttributes
>;

/** The `GeneratedParam` resource constructor — `yield* GeneratedParam(id, { bytes })` in the lowering. */
export const GeneratedParam = Resource<GeneratedParam>('PrismaCloud.GeneratedParam');

/** A fresh generated value: `bytes` random bytes, base64. */
export function generateValue(bytes: number): GeneratedParamAttributes {
  const random = crypto.getRandomValues(new Uint8Array(bytes));
  return { value: btoa(String.fromCharCode(...random)) };
}

/**
 * The `GeneratedParam` provider service. `reconcile` runs for create and
 * update; it returns the persisted `output` when present (a redeploy reuses the
 * stored value — the no-op property, and the reason a `bytes` change does not
 * re-generate) and generates a fresh value only on first create. Nothing to
 * enumerate (`list` → `[]`) or tear down (`delete` → no-op; the value lives
 * only in state). Exported so tests can drive it directly.
 */
export const generatedParamProviderService: Provider.ProviderService<GeneratedParam> = {
  list: () => Effect.succeed([]),
  reconcile: ({ news, output }) => Effect.sync(() => output ?? generateValue(news.bytes)),
  delete: () => Effect.void,
};

/** The `GeneratedParam` provider layer — merged into the extension descriptor's `providers()`. */
export const GeneratedParamProvider = () =>
  Provider.effect(GeneratedParam, Effect.succeed(generatedParamProviderService));
